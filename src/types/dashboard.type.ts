/**
 * DTOs y tipos para el módulo de dashboard admin
 */

// Query params comunes
export interface IDashboardDateRange {
  fecha_desde?: string;
  fecha_hasta?: string;
}

// 1. KPIs Principales
export interface IKpisResponse {
  total_ventas_netas: number;
  cantidad_ordenes: number;
  ticket_promedio: number;
  clientes_unicos: number;
}

// 2. Ventas en el tiempo
export interface ISalesOverTimeItem {
  fecha: string; // YYYY-MM-DD
  total_vendido: number;
  cantidad_ordenes: number;
}

export interface ISalesOverTimeResponse {
  data: ISalesOverTimeItem[];
}

// 3. Estado de órdenes
export interface IOrderStatusItem {
  estado_pago: string;
  cantidad: number;
}

export interface IOrderStatusResponse {
  data: IOrderStatusItem[];
}

// 4. Top productos
export interface ITopProductItem {
  id_producto: number;
  nombre: string;
  cantidad_vendida: number;
  total_facturado: number;
}

export interface ITopProductsResponse {
  data: ITopProductItem[];
}

// 5. Ventas por categoría
export interface ISalesByCategoryItem {
  categoria: string;
  total_vendido: number;
  cantidad_productos_vendidos: number;
}

export interface ISalesByCategoryResponse {
  data: ISalesByCategoryItem[];
}

// 6. Clientes summary
export interface ICustomersSummaryResponse {
  clientes_nuevos: number;
  clientes_recurrentes: number;
}

// 7. Alertas operativas
export interface IAlertsResponse {
  productos_stock_bajo: number;
  ventas_pendientes: number;
  ventas_problemas_pago: number;
}

