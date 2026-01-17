import { prisma } from '../index';
import { Prisma } from '@prisma/client';

/**
 * Repository para queries del dashboard
 * Todas las queries usan agregaciones SQL optimizadas
 */
export class DashboardRepository {
  /**
   * Obtiene KPIs principales (solo agregados, sin listas)
   */
  async getKpis(dateFrom: Date, dateTo: Date) {
    const whereClause: Prisma.ventaWhereInput = {
      fecha: {
        gte: dateFrom,
        lte: dateTo,
      },
    };

    // Total ventas netas y cantidad de órdenes
    const salesAggregation = await prisma.venta.aggregate({
      where: whereClause,
      _sum: {
        total_neto: true,
      },
      _count: {
        id_venta: true,
      },
    });

    const totalVentasNetas = Number(salesAggregation._sum.total_neto || 0);
    const cantidadOrdenes = salesAggregation._count.id_venta;

    // Ticket promedio
    const ticketPromedio = cantidadOrdenes > 0 ? totalVentasNetas / cantidadOrdenes : 0;

    // Clientes únicos (distinct count)
    const clientesUnicos = await prisma.venta.groupBy({
      where: whereClause,
      by: ['id_cliente'],
    });

    return {
      total_ventas_netas: totalVentasNetas,
      cantidad_ordenes: cantidadOrdenes,
      ticket_promedio: ticketPromedio,
      clientes_unicos: clientesUnicos.filter((c) => c.id_cliente !== null).length,
    };
  }

  /**
   * Obtiene ventas agrupadas por día
   */
  async getSalesOverTime(dateFrom: Date, dateTo: Date) {
    // Usar raw query para agrupar por fecha (solo día, sin hora)
    const results = await prisma.$queryRaw<Array<{
      fecha: Date;
      total_vendido: number;
      cantidad_ordenes: number;
    }>>`
      SELECT 
        DATE(fecha) as fecha,
        COALESCE(SUM(total_neto), 0)::numeric as total_vendido,
        COUNT(id_venta)::int as cantidad_ordenes
      FROM venta
      WHERE fecha >= ${dateFrom}::timestamp
        AND fecha <= ${dateTo}::timestamp
      GROUP BY DATE(fecha)
      ORDER BY fecha ASC
    `;

    return results.map((row) => ({
      fecha: row.fecha instanceof Date ? row.fecha.toISOString().split('T')[0] : String(row.fecha).split('T')[0], // YYYY-MM-DD
      total_vendido: Number(row.total_vendido),
      cantidad_ordenes: Number(row.cantidad_ordenes),
    }));
  }

  /**
   * Obtiene cantidad de órdenes por estado de pago
   */
  async getOrderStatus(dateFrom: Date, dateTo: Date) {
    const results = await prisma.venta.groupBy({
      where: {
        fecha: {
          gte: dateFrom,
          lte: dateTo,
        },
      },
      by: ['estado_pago'],
      _count: {
        id_venta: true,
      },
    });

    return results
      .filter((r) => r.estado_pago !== null)
      .map((r) => ({
        estado_pago: r.estado_pago!,
        cantidad: r._count.id_venta,
      }))
      .sort((a, b) => b.cantidad - a.cantidad);
  }

  /**
   * Obtiene top productos vendidos
   */
  async getTopProducts(dateFrom: Date, dateTo: Date, limit: number = 10) {
    // Usar raw query para optimizar con JOIN
    const results = await prisma.$queryRaw<Array<{
      id_producto: number;
      nombre: string | null;
      cantidad_vendida: number;
      total_facturado: number;
    }>>`
      SELECT 
        vd.id_prod as id_producto,
        p.nombre,
        SUM(vd.cantidad)::int as cantidad_vendida,
        COALESCE(SUM(vd.sub_total), 0)::numeric as total_facturado
      FROM "venta-detalle" vd
      INNER JOIN venta v ON vd.id_venta = v.id_venta
      INNER JOIN productos p ON vd.id_prod = p.id_prod
      WHERE v.fecha >= ${dateFrom}::timestamp
        AND v.fecha <= ${dateTo}::timestamp
      GROUP BY vd.id_prod, p.nombre
      ORDER BY cantidad_vendida DESC
      LIMIT ${limit}
    `;

    return results.map((row) => ({
      id_producto: row.id_producto,
      nombre: row.nombre || 'Producto sin nombre',
      cantidad_vendida: Number(row.cantidad_vendida),
      total_facturado: Number(row.total_facturado),
    }));
  }

  /**
   * Obtiene ventas agrupadas por categoría
   */
  async getSalesByCategory(dateFrom: Date, dateTo: Date) {
    const results = await prisma.$queryRaw<Array<{
      categoria: string | null;
      total_vendido: number;
      cantidad_productos_vendidos: number;
    }>>`
      SELECT 
        COALESCE(c.nombre, 'Sin categoría') as categoria,
        COALESCE(SUM(vd.sub_total), 0)::numeric as total_vendido,
        SUM(vd.cantidad)::int as cantidad_productos_vendidos
      FROM "venta-detalle" vd
      INNER JOIN venta v ON vd.id_venta = v.id_venta
      INNER JOIN productos p ON vd.id_prod = p.id_prod
      LEFT JOIN categoria c ON p.codi_categoria = c.codi_categoria
      WHERE v.fecha >= ${dateFrom}::timestamp
        AND v.fecha <= ${dateTo}::timestamp
      GROUP BY c.nombre
      ORDER BY total_vendido DESC
    `;

    return results.map((row) => ({
      categoria: row.categoria || 'Sin categoría',
      total_vendido: Number(row.total_vendido),
      cantidad_productos_vendidos: Number(row.cantidad_productos_vendidos),
    }));
  }

  /**
   * Obtiene resumen de clientes (nuevos vs recurrentes)
   */
  async getCustomersSummary(dateFrom: Date, dateTo: Date) {
    // Clientes que hicieron su primera compra en el período
    const clientesNuevos = await prisma.$queryRaw<Array<{ count: number }>>`
      WITH primera_compra AS (
        SELECT 
          id_cliente,
          MIN(fecha) as primera_fecha
        FROM venta
        WHERE id_cliente IS NOT NULL
        GROUP BY id_cliente
      )
      SELECT COUNT(DISTINCT v.id_cliente)::int as count
      FROM venta v
      INNER JOIN primera_compra pc ON v.id_cliente = pc.id_cliente
      WHERE v.fecha >= ${dateFrom}::timestamp
        AND v.fecha <= ${dateTo}::timestamp
        AND pc.primera_fecha >= ${dateFrom}::timestamp
        AND pc.primera_fecha <= ${dateTo}::timestamp
    `;

    // Clientes que compraron en el período pero ya habían comprado antes
    const clientesRecurrentes = await prisma.$queryRaw<Array<{ count: number }>>`
      WITH primera_compra AS (
        SELECT 
          id_cliente,
          MIN(fecha) as primera_fecha
        FROM venta
        WHERE id_cliente IS NOT NULL
        GROUP BY id_cliente
      )
      SELECT COUNT(DISTINCT v.id_cliente)::int as count
      FROM venta v
      INNER JOIN primera_compra pc ON v.id_cliente = pc.id_cliente
      WHERE v.fecha >= ${dateFrom}::timestamp
        AND v.fecha <= ${dateTo}::timestamp
        AND pc.primera_fecha < ${dateFrom}::timestamp
    `;

    return {
      clientes_nuevos: Number(clientesNuevos[0]?.count || 0),
      clientes_recurrentes: Number(clientesRecurrentes[0]?.count || 0),
    };
  }

  /**
   * Obtiene alertas operativas (solo contadores)
   */
  async getAlerts() {
    // Productos con stock bajo (stock <= stock_min o stock <= 10 si stock_min es null)
    const productosStockBajoResult = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int as count
      FROM productos
      WHERE activo = 'S'
        AND (
          (stock_min IS NOT NULL AND stock <= stock_min)
          OR (stock_min IS NULL AND stock <= 10)
        )
    `;

    const productosStockBajo = Number(productosStockBajoResult[0]?.count || 0);

    // Ventas pendientes
    const ventasPendientes = await prisma.venta.count({
      where: {
        estado_pago: 'pendiente',
      },
    });

    // Ventas con problemas de pago (rechazado, cancelado, etc.)
    const ventasProblemasPago = await prisma.venta.count({
      where: {
        estado_pago: {
          in: ['rechazado', 'cancelado', 'error'],
        },
      },
    });

    return {
      productos_stock_bajo: productosStockBajo,
      ventas_pendientes: ventasPendientes,
      ventas_problemas_pago: ventasProblemasPago,
    };
  }
}

