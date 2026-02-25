/**
 * linkIngcoImages.ts
 *
 * Enlaza imágenes INGCO a productos en la DB por coincidencia de codi_arti.
 *
 * Reglas:
 *  - Solo procesa archivos en IMAGENES/INGCO/ (no subdirectorios)
 *  - Extrae el número inicial del nombre de archivo como codi_arti
 *  - NUNCA pisa img_principal si ya tiene valor (imagen manual)
 *  - El path guardado en DB es relativo: IMAGENES/INGCO/<archivo>
 *
 * Uso:
 *   npx ts-node linkIngcoImages.ts [--dry-run]
 *
 *   --dry-run  Muestra qué haría sin escribir en la DB
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// ─── CONFIG ────────────────────────────────────────────────────────────────────

/** Carpeta física donde están las imágenes INGCO en el servidor */
const INGCO_DIR = '/opt/files/IMAGENES/INGCO';

/** Prefijo relativo que se guarda en la DB (sin barra inicial) */
const DB_PREFIX = 'IMAGENES/INGCO';

/** Extensiones de imagen permitidas */
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

// ─── HELPERS ───────────────────────────────────────────────────────────────────

/**
 * Extrae el código numérico inicial del nombre de un archivo.
 * Ej: "633001-TALADRO 45Nm 20V CDLI20051-4.jpg" → "633001"
 *     "BROCAS SDS PLUS UNIVERSAL.png"            → null  (no empieza con número)
 */
function extractCodiArti(filename: string): string | null {
  const match = filename.match(/^(\d+)/);
  return match ? match[1] : null;
}

/**
 * Construye el path relativo para guardar en DB.
 * Ej: "633001-TALADRO 45Nm 20V.jpg" → "IMAGENES/INGCO/633001-TALADRO 45Nm 20V.jpg"
 */
function buildDbPath(filename: string): string {
  return `${DB_PREFIX}/${filename}`;
}

// ─── MAIN ──────────────────────────────────────────────────────────────────────

async function main() {
  const isDryRun = process.argv.includes('--dry-run');

  if (isDryRun) {
    console.log('🔍 MODO DRY-RUN: no se escribirá nada en la DB\n');
  }

  // 1. Leer archivos de la carpeta INGCO
  if (!fs.existsSync(INGCO_DIR)) {
    console.error(`❌ No se encontró el directorio: ${INGCO_DIR}`);
    process.exit(1);
  }

  const entries = fs.readdirSync(INGCO_DIR, { withFileTypes: true });
  const imageFiles = entries
    .filter(e => e.isFile())
    .map(e => e.name)
    .filter(name => ALLOWED_EXT.has(path.extname(name).toLowerCase()));

  console.log(`📁 Archivos de imagen encontrados en ${INGCO_DIR}: ${imageFiles.length}\n`);

  // 2. Estadísticas
  const stats = {
    procesados: 0,
    asignados: 0,
    saltados_tiene_imagen: 0,
    saltados_sin_producto: 0,
    saltados_sin_codigo: 0,
    errores: 0,
  };

  const detalles: Array<{ archivo: string; codi_arti: string; accion: string }> = [];

  // 3. Procesar cada archivo
  for (const filename of imageFiles) {
    const codiArti = extractCodiArti(filename);

    if (!codiArti) {
      stats.saltados_sin_codigo++;
      detalles.push({ archivo: filename, codi_arti: '-', accion: 'SALTAR: nombre no empieza con número' });
      continue;
    }

    try {
      // Buscar producto - puede tener menos dígitos (ej: codi_arti "633001" truncado a 10 chars)
      const producto = await prisma.productos.findFirst({
        where: {
          // codi_arti puede estar truncado a 10 chars en la DB según el importer
          codi_arti: codiArti.substring(0, 10),
        },
        select: {
          id_prod: true,
          codi_arti: true,
          nombre: true,
          img_principal: true,
        },
      });

      if (!producto) {
        stats.saltados_sin_producto++;
        detalles.push({ archivo: filename, codi_arti: codiArti, accion: 'SALTAR: producto no encontrado en DB' });
        continue;
      }

      // Regla principal: NO pisar si ya tiene imagen
      if (producto.img_principal && producto.img_principal.trim() !== '') {
        stats.saltados_tiene_imagen++;
        detalles.push({
          archivo: filename,
          codi_arti: codiArti,
          accion: `SALTAR: ya tiene imagen → ${producto.img_principal}`,
        });
        continue;
      }

      // Asignar imagen
      const dbPath = buildDbPath(filename);
      stats.asignados++;

      detalles.push({
        archivo: filename,
        codi_arti: codiArti,
        accion: `ASIGNAR → ${dbPath}`,
      });

      if (!isDryRun) {
        await prisma.productos.update({
          where: { id_prod: producto.id_prod },
          data: {
            img_principal: dbPath,
            actualizado_en: new Date(),
          },
        });
      }
    } catch (err: any) {
      stats.errores++;
      detalles.push({
        archivo: filename,
        codi_arti: codiArti,
        accion: `ERROR: ${err?.message ?? String(err)}`,
      });
    }

    stats.procesados++;
  }

  // 4. Mostrar resultado detallado
  console.log('─'.repeat(80));
  console.log('DETALLE POR ARCHIVO:');
  console.log('─'.repeat(80));
  for (const d of detalles) {
    const icon =
      d.accion.startsWith('ASIGNAR') ? '✅' :
      d.accion.startsWith('SALTAR: ya tiene') ? '🔒' :
      d.accion.startsWith('SALTAR: producto') ? '⚠️' :
      d.accion.startsWith('SALTAR: nombre') ? '⬜' :
      '❌';
    console.log(`${icon} [${d.codi_arti.padEnd(10)}] ${d.archivo.substring(0, 50).padEnd(52)} → ${d.accion}`);
  }

  // 5. Resumen final
  console.log('\n' + '─'.repeat(80));
  console.log('RESUMEN:');
  console.log('─'.repeat(80));
  console.log(`  Archivos de imagen leídos  : ${imageFiles.length}`);
  console.log(`  Procesados (con código)    : ${stats.procesados}`);
  console.log(`  ✅ Asignados               : ${stats.asignados}${isDryRun ? ' (dry-run, no guardado)' : ''}`);
  console.log(`  🔒 Saltados (ya tenían img): ${stats.saltados_tiene_imagen}`);
  console.log(`  ⚠️  Saltados (no en DB)     : ${stats.saltados_sin_producto}`);
  console.log(`  ⬜ Saltados (sin nro. ini.) : ${stats.saltados_sin_codigo}`);
  console.log(`  ❌ Errores                 : ${stats.errores}`);
  console.log('─'.repeat(80));

  if (isDryRun) {
    console.log('\n💡 Corré sin --dry-run para aplicar los cambios.');
  } else {
    console.log(`\n🎉 Listo. Se actualizaron ${stats.asignados} productos.`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('Error fatal:', e);
  await prisma.$disconnect();
  process.exit(1);
});