/**
 * Script para truncar la tabla productos
 * Maneja las foreign keys eliminando primero las referencias en venta_detalle
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function truncarProductos() {
  console.log('🗑️  Iniciando truncado de tabla productos...\n');

  try {
    // Primero eliminar registros de venta_detalle que referencian productos
    console.log('📝 Eliminando registros de venta_detalle relacionados...');
    const ventaDetalleEliminados = await prisma.$executeRaw`
      DELETE FROM "venta-detalle" WHERE id_prod IS NOT NULL
    `;
    console.log(`✓ Registros de venta_detalle eliminados: ${ventaDetalleEliminados}`);

    // Luego truncar la tabla productos
    console.log('\n🗑️  Truncando tabla productos...');
    await prisma.$executeRaw`TRUNCATE TABLE productos RESTART IDENTITY CASCADE`;
    console.log('✓ Tabla productos truncada exitosamente');

    console.log('\n✅ Proceso completado!');
  } catch (error) {
    console.error('\n❌ Error al truncar productos:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar
if (require.main === module) {
  truncarProductos()
    .then(() => {
      console.log('\nProceso finalizado');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Error fatal:', error);
      process.exit(1);
    });
}

export { truncarProductos };

