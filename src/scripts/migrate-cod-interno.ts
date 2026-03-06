/**
 * Script de migración: Asigna cod_interno a ventas existentes.
 * Formato: "MAX-00000001" (prefijo MAX- + id_venta a 8 dígitos).
 *
 * Ejecutar UNA VEZ para ventas con cod_interno null.
 *
 * Uso:
 *   npx ts-node src/scripts/migrate-cod-interno.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateCodInterno() {
    console.log('🔄 Iniciando migración de cod_interno...');

    try {
        // Obtener todas las ventas sin cod_interno
        const ventasSinCodigo = await prisma.venta.findMany({
            where: {
                cod_interno: null,
            },
            select: {
                id_venta: true,
            },
            orderBy: {
                id_venta: 'asc',
            },
        });

        console.log(`📋 Encontradas ${ventasSinCodigo.length} venta(s) sin cod_interno`);

        if (ventasSinCodigo.length === 0) {
            console.log('✅ No hay ventas para migrar');
            return;
        }

        let migradas = 0;
        let errores = 0;

        // Migrar cada venta
        for (const venta of ventasSinCodigo) {
            try {
                const codInterno = 'MAX-' + venta.id_venta.toString().padStart(8, '0');

                await prisma.venta.update({
                    where: { id_venta: venta.id_venta },
                    data: {
                        cod_interno: codInterno,
                    },
                });

                migradas++;
                if (migradas % 100 === 0) {
                    console.log(`📊 Progreso: ${migradas}/${ventasSinCodigo.length} ventas migradas...`);
                }
            } catch (error: any) {
                console.error(`❌ Error migrando venta #${venta.id_venta}:`, error.message);
                errores++;
            }
        }

        console.log(`\n✅ Migración completada:`);
        console.log(`   - Migradas: ${migradas}`);
        console.log(`   - Errores: ${errores}`);
        console.log(`   - Total: ${ventasSinCodigo.length}`);

    } catch (error: any) {
        console.error('❌ Error en la migración:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// Ejecutar migración
migrateCodInterno()
    .then(() => {
        console.log('✅ Script finalizado exitosamente');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Error fatal:', error);
        process.exit(1);
    });
