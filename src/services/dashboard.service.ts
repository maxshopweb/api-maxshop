import { DashboardRepository } from '../repositories/dashboard.repository';
import {
  IKpisResponse,
  ISalesOverTimeResponse,
  IOrderStatusResponse,
  ITopProductsResponse,
  ISalesByCategoryResponse,
  ICustomersSummaryResponse,
  IAlertsResponse,
  IDashboardDateRange,
} from '../types/dashboard.type';

/**
 * Service para lógica de negocio del dashboard
 */
export class DashboardService {
  private repository: DashboardRepository;

  constructor() {
    this.repository = new DashboardRepository();
  }

  /**
   * Calcula el rango de fechas según los parámetros o defaults
   */
  private calculateDateRange(params?: IDashboardDateRange, defaultDays: number = 7): { from: Date; to: Date } {
    const to = params?.fecha_hasta ? new Date(params.fecha_hasta) : new Date();
    const from = params?.fecha_desde
      ? new Date(params.fecha_desde)
      : new Date(to.getTime() - defaultDays * 24 * 60 * 60 * 1000);

    // Asegurar que 'to' incluya todo el día (23:59:59)
    to.setHours(23, 59, 59, 999);
    // Asegurar que 'from' empiece al inicio del día (00:00:00)
    from.setHours(0, 0, 0, 0);

    return { from, to };
  }

  /**
   * 1. Obtiene KPIs principales
   */
  async getKpis(params?: IDashboardDateRange): Promise<IKpisResponse> {
    const { from, to } = this.calculateDateRange(params, 7);
    return this.repository.getKpis(from, to);
  }

  /**
   * 2. Obtiene ventas en el tiempo
   */
  async getSalesOverTime(params?: IDashboardDateRange): Promise<ISalesOverTimeResponse> {
    const { from, to } = this.calculateDateRange(params, 30);
    const data = await this.repository.getSalesOverTime(from, to);
    return { data };
  }

  /**
   * 3. Obtiene estado de órdenes
   */
  async getOrderStatus(params?: IDashboardDateRange): Promise<IOrderStatusResponse> {
    const { from, to } = this.calculateDateRange(params, 30);
    const data = await this.repository.getOrderStatus(from, to);
    return { data };
  }

  /**
   * 4. Obtiene top productos
   */
  async getTopProducts(params?: IDashboardDateRange, limit: number = 10): Promise<ITopProductsResponse> {
    const { from, to } = this.calculateDateRange(params, 30);
    const data = await this.repository.getTopProducts(from, to, limit);
    return { data };
  }

  /**
   * 5. Obtiene ventas por categoría
   */
  async getSalesByCategory(params?: IDashboardDateRange): Promise<ISalesByCategoryResponse> {
    const { from, to } = this.calculateDateRange(params, 30);
    const data = await this.repository.getSalesByCategory(from, to);
    return { data };
  }

  /**
   * 6. Obtiene resumen de clientes
   */
  async getCustomersSummary(params?: IDashboardDateRange): Promise<ICustomersSummaryResponse> {
    const { from, to } = this.calculateDateRange(params, 30);
    return this.repository.getCustomersSummary(from, to);
  }

  /**
   * 7. Obtiene alertas operativas
   */
  async getAlerts(): Promise<IAlertsResponse> {
    return this.repository.getAlerts();
  }
}

