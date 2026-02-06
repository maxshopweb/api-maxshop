import { prisma } from '../index';
import { ISituacionFiscal } from '../types';

export class SituacionFiscalService {

    async getAll(activoOnly = true): Promise<ISituacionFiscal[]> {
        const where = activoOnly ? { activo: true } : {};
        const situaciones = await prisma.situacion_fiscal.findMany({
            where,
            orderBy: { codi_sifi: 'asc' }
        });
        return situaciones.map((s) => ({
            id_sifi: s.id_sifi,
            codi_sifi: s.codi_sifi,
            nombre: s.nombre,
            codi_impuesto: s.codi_impuesto,
            activo: s.activo,
            creado_en: s.creado_en,
            actualizado_en: s.actualizado_en
        })) as ISituacionFiscal[];
    }

    async getById(id: number): Promise<ISituacionFiscal | null> {
        const s = await prisma.situacion_fiscal.findUnique({
            where: { id_sifi: id }
        });
        if (!s) return null;
        return {
            id_sifi: s.id_sifi,
            codi_sifi: s.codi_sifi,
            nombre: s.nombre,
            codi_impuesto: s.codi_impuesto,
            activo: s.activo,
            creado_en: s.creado_en,
            actualizado_en: s.actualizado_en
        } as ISituacionFiscal;
    }

    async getByCodigo(codi_sifi: string): Promise<ISituacionFiscal | null> {
        const s = await prisma.situacion_fiscal.findUnique({
            where: { codi_sifi: codi_sifi.toUpperCase() }
        });
        if (!s) return null;
        return {
            id_sifi: s.id_sifi,
            codi_sifi: s.codi_sifi,
            nombre: s.nombre,
            codi_impuesto: s.codi_impuesto,
            activo: s.activo,
            creado_en: s.creado_en,
            actualizado_en: s.actualizado_en
        } as ISituacionFiscal;
    }
}
