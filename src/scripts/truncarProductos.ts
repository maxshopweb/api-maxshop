/**
 * Script para truncar la tabla productos
 * Maneja las foreign keys eliminando primero las referencias en venta_detalle
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function truncarProductos() {

  try {
    // Primero eliminar registros de venta_detalle que referencian productos
    const ventaDetalleEliminados = await prisma.$executeRaw`
      DELETE FROM "venta-detalle" WHERE id_prod IS NOT NULL
    `;

    // Luego truncar la tabla productos
    await prisma.$executeRaw`TRUNCATE TABLE productos RESTART IDENTITY CASCADE`;

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
      process.exit(0);
    })
    .catch((error) => {
      console.error('Error fatal:', error);
      process.exit(1);
    });
}

export { truncarProductos };

