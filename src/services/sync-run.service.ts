/**
 * Servicio para persistir y consultar el historial de corridas de sincronización FTP.
 * Registra cada ejecución (automática o on-demand) con su resultado, fases y errores.
 * Opcionalmente sube un JSON de estado al FTP en /Tekno/maxshop-status.json.
 */

import * as fs from 'fs';
import * as path from 'path';
import { prisma } from '../index';
import { SincronizacionResult, SincronizacionIncrementalResult } from '../types/sincronizacion.types';
import ftpService from './ftp.service';

export type SyncTrigger = 'AUTO' | 'ON_DEMAND';
export type SyncResultado = 'COMPLETA' | 'PARCIAL' | 'FALLIDA';

export interface SyncRunSummary {
  id: number;
  iniciado_en: Date;
  finalizado_en: Date;
  duracion_ms: number;
  trigger: string;
  resultado: string;
  archivos_descargados: number;
  archivos_convertidos: number;
  archivos_importados: number;
  total_registros: number | null;
  errores: unknown;
  mensaje: string | null;
  ftp_json_subido: boolean;
  creado_en: Date;
}

export interface SyncStats {
  ultimaCorrida: SyncRunSummary | null;
  ultimaExitosa: SyncRunSummary | null;
  horasSinExito: number | null;
  tasaExito7d: number;
  totalUltimas24h: number;
  exitosasUltimas24h: number;
}

const TEMP_DIR = path.join(__dirname, '../../temp');
const FTP_STATUS_PATH = '/Tekno/maxshop-status.json';

function calcularResultado(result: SincronizacionResult): SyncResultado {
  if (!result.exito) return 'FALLIDA';
  const tieneErrores =
    result.errores.length > 0 ||
    result.fases.descargaFTP.errores.length > 0 ||
    result.fases.conversionCSV.errores.length > 0 ||
    result.fases.importacionBD.errores.length > 0;
  const descargados = result.fases.descargaFTP.archivosDescargados;
  const convertidos = result.fases.conversionCSV.archivosConvertidos;
  const importados = result.fases.importacionBD.resumen?.resultados.length ?? 0;
  const hayFaltantes = descargados > 0 && (convertidos < descargados || importados < convertidos);
  return tieneErrores || hayFaltantes ? 'PARCIAL' : 'COMPLETA';
}

function recopilarErrores(result: SincronizacionResult): string[] {
  const errores: string[] = [...result.errores];
  if (result.fases.descargaFTP.errores.length > 0) {
    errores.push(...result.fases.descargaFTP.errores.map(e => `[FTP] ${e}`));
  }
  if (result.fases.conversionCSV.errores.length > 0) {
    errores.push(...result.fases.conversionCSV.errores.map(e => `[CSV] ${e}`));
  }
  if (result.fases.importacionBD.errores.length > 0) {
    errores.push(...result.fases.importacionBD.errores.map(e => `[BD] ${e}`));
  }
  return errores;
}

export class SyncRunService {
  /**
   * Guarda una corrida completa en la BD y opcionalmente sube el JSON al FTP.
   */
  async save(result: SincronizacionResult, trigger: SyncTrigger): Promise<SyncRunSummary> {
    const resultado = calcularResultado(result);
    const errores = recopilarErrores(result);
    const totalRegistros = result.fases.importacionBD.resumen?.estadisticas.totalRegistros ?? null;

    const run = await prisma.sync_run.create({
      data: {
        iniciado_en: result.inicio,
        finalizado_en: result.fin,
        duracion_ms: result.duracionTotalMs,
        trigger,
        resultado,
        archivos_descargados: result.fases.descargaFTP.archivosDescargados,
        archivos_convertidos: result.fases.conversionCSV.archivosConvertidos,
        archivos_importados: result.fases.importacionBD.resumen?.resultados.length ?? 0,
        total_registros: totalRegistros,
        errores: errores as unknown as import('@prisma/client').Prisma.InputJsonValue,
        mensaje: result.mensaje,
        ftp_json_subido: false,
      },
    });

    const summary = run as SyncRunSummary;

    // Intentar subir JSON al FTP sin bloquear
    this.uploadStatusJson(summary).catch(err => {
      console.warn('[SyncRunService] No se pudo subir status.json al FTP:', err?.message || err);
    });

    return summary;
  }

  /**
   * Guarda una corrida incremental (datos reducidos, sin fases detalladas).
   */
  async saveIncremental(
    result: SincronizacionIncrementalResult,
    trigger: SyncTrigger
  ): Promise<SyncRunSummary> {
    const resultado: SyncResultado = result.exito
      ? result.errores.length > 0
        ? 'PARCIAL'
        : 'COMPLETA'
      : 'FALLIDA';

    const run = await prisma.sync_run.create({
      data: {
        iniciado_en: new Date(Date.now() - result.duracionMs),
        finalizado_en: new Date(),
        duracion_ms: result.duracionMs,
        trigger,
        resultado,
        archivos_descargados: result.archivosProcesados.length,
        archivos_convertidos: result.archivosProcesados.length,
        archivos_importados: result.importacionesEjecutadas.length,
        total_registros: null,
        errores: result.errores as unknown as import('@prisma/client').Prisma.InputJsonValue,
        mensaje: result.sinCambios ? 'Sin cambios en FTP (incremental)' : result.mensaje,
        ftp_json_subido: false,
      },
    });

    const summary = run as SyncRunSummary;

    this.uploadStatusJson(summary).catch(err => {
      console.warn('[SyncRunService] No se pudo subir status.json al FTP:', err?.message || err);
    });

    return summary;
  }

  /**
   * Retorna la lista paginada de corridas, más recientes primero.
   */
  async findAll(
    page = 1,
    limit = 50
  ): Promise<{ runs: SyncRunSummary[]; total: number }> {
    const skip = (page - 1) * limit;
    const [runs, total] = await Promise.all([
      prisma.sync_run.findMany({
        orderBy: { iniciado_en: 'desc' },
        skip,
        take: limit,
      }),
      prisma.sync_run.count(),
    ]);
    return { runs: runs as SyncRunSummary[], total };
  }

  /**
   * Retorna el detalle de una corrida por ID.
   */
  async findById(id: number): Promise<SyncRunSummary | null> {
    const run = await prisma.sync_run.findUnique({ where: { id } });
    return run as SyncRunSummary | null;
  }

  /**
   * Calcula estadísticas para los cards del dashboard.
   */
  async getStats(): Promise<SyncStats> {
    const [ultimaCorrida, ultimaExitosa] = await Promise.all([
      prisma.sync_run.findFirst({ orderBy: { iniciado_en: 'desc' } }),
      prisma.sync_run.findFirst({
        where: { resultado: 'COMPLETA' },
        orderBy: { iniciado_en: 'desc' },
      }),
    ]);

    const hace7dias = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [total7d, exitosas7d, total24h, exitosas24h] = await Promise.all([
      prisma.sync_run.count({ where: { iniciado_en: { gte: hace7dias } } }),
      prisma.sync_run.count({
        where: { iniciado_en: { gte: hace7dias }, resultado: 'COMPLETA' },
      }),
      prisma.sync_run.count({ where: { iniciado_en: { gte: hace24h } } }),
      prisma.sync_run.count({
        where: { iniciado_en: { gte: hace24h }, resultado: 'COMPLETA' },
      }),
    ]);

    const horasSinExito =
      ultimaExitosa
        ? Math.round((Date.now() - ultimaExitosa.finalizado_en.getTime()) / (1000 * 60 * 60) * 10) / 10
        : null;

    return {
      ultimaCorrida: ultimaCorrida as SyncRunSummary | null,
      ultimaExitosa: ultimaExitosa as SyncRunSummary | null,
      horasSinExito,
      tasaExito7d: total7d > 0 ? Math.round((exitosas7d / total7d) * 100) : 0,
      totalUltimas24h: total24h,
      exitosasUltimas24h: exitosas24h,
    };
  }

  /**
   * Genera y sube un JSON de estado al FTP en /Tekno/maxshop-status.json.
   * Falla silenciosamente sin propagar el error.
   */
  async uploadStatusJson(run: SyncRunSummary): Promise<void> {
    const statusJson = {
      service: 'maxshop-sync',
      generatedAt: new Date().toISOString(),
      lastRunAt: run.iniciado_en,
      trigger: run.trigger,
      status: run.resultado,
      duracionMs: run.duracion_ms,
      summary: {
        downloaded: run.archivos_descargados,
        converted: run.archivos_convertidos,
        imported: run.archivos_importados,
        totalRecords: run.total_registros,
        errors: Array.isArray(run.errores) ? (run.errores as string[]).length : 0,
      },
      message: run.mensaje,
    };

    if (!fs.existsSync(TEMP_DIR)) {
      fs.mkdirSync(TEMP_DIR, { recursive: true });
    }

    const localPath = path.join(TEMP_DIR, 'maxshop-status.json');
    fs.writeFileSync(localPath, JSON.stringify(statusJson, null, 2), 'utf-8');

    try {
      await ftpService.connect();
      await ftpService.uploadFile(localPath, FTP_STATUS_PATH);
      await ftpService.disconnect();

      await prisma.sync_run.update({
        where: { id: run.id },
        data: { ftp_json_subido: true },
      });

      console.log(`[SyncRunService] Status JSON subido al FTP: ${FTP_STATUS_PATH}`);
    } finally {
      try {
        if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
      } catch {
        // ignorar fallo al limpiar temporal
      }
    }
  }
}

export const syncRunService = new SyncRunService();
export default syncRunService;
