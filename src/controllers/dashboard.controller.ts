import { Request, Response } from 'express';
import { DashboardService } from '../services/dashboard.service';
import { z } from 'zod';
import { IApiResponse } from '../types';

const dashboardService = new DashboardService();

// Schemas de validación Zod
const dateRangeSchema = z.object({
  fecha_desde: z.string().optional(),
  fecha_hasta: z.string().optional(),
});

const topProductsQuerySchema = dateRangeSchema.extend({
  limit: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 10)),
});

/**
 * Controller para endpoints del dashboard admin
 */
export class DashboardController {
  /**
   * 1. GET /admin/dashboard/kpis
   * KPIs principales (header)
   */
  async getKpis(req: Request, res: Response): Promise<void> {
    try {
      const validated = dateRangeSchema.parse(req.query);
      const result = await dashboardService.getKpis(validated);

      const response: IApiResponse<typeof result> = {
        success: true,
        data: result,
      };

      res.json(response);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Parámetros inválidos',
          details: error.issues,
        });
        return;
      }

      console.error('Error en getKpis:', error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener KPIs',
      });
    }
  }

  /**
   * 2. GET /admin/dashboard/sales-over-time
   * Ventas en el tiempo (gráfico)
   */
  async getSalesOverTime(req: Request, res: Response): Promise<void> {
    try {
      const validated = dateRangeSchema.parse(req.query);
      const result = await dashboardService.getSalesOverTime(validated);

      const response: IApiResponse<typeof result> = {
        success: true,
        data: result,
      };

      res.json(response);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Parámetros inválidos',
          details: error.issues,
        });
        return;
      }

      console.error('Error en getSalesOverTime:', error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener ventas en el tiempo',
      });
    }
  }

  /**
   * 3. GET /admin/dashboard/order-status
   * Estado de órdenes (gráfico donut)
   */
  async getOrderStatus(req: Request, res: Response): Promise<void> {
    try {
      const validated = dateRangeSchema.parse(req.query);
      const result = await dashboardService.getOrderStatus(validated);

      const response: IApiResponse<typeof result> = {
        success: true,
        data: result,
      };

      res.json(response);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Parámetros inválidos',
          details: error.issues,
        });
        return;
      }

      console.error('Error en getOrderStatus:', error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener estado de órdenes',
      });
    }
  }

  /**
   * 4. GET /admin/dashboard/top-products
   * Top productos vendidos
   */
  async getTopProducts(req: Request, res: Response): Promise<void> {
    try {
      const validated = topProductsQuerySchema.parse(req.query);
      const result = await dashboardService.getTopProducts(validated, validated.limit);

      const response: IApiResponse<typeof result> = {
        success: true,
        data: result,
      };

      res.json(response);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Parámetros inválidos',
          details: error.issues,
        });
        return;
      }

      console.error('Error en getTopProducts:', error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener top productos',
      });
    }
  }

  /**
   * 5. GET /admin/dashboard/sales-by-category
   * Ventas por categoría
   */
  async getSalesByCategory(req: Request, res: Response): Promise<void> {
    try {
      const validated = dateRangeSchema.parse(req.query);
      const result = await dashboardService.getSalesByCategory(validated);

      const response: IApiResponse<typeof result> = {
        success: true,
        data: result,
      };

      res.json(response);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Parámetros inválidos',
          details: error.issues,
        });
        return;
      }

      console.error('Error en getSalesByCategory:', error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener ventas por categoría',
      });
    }
  }

  /**
   * 6. GET /admin/dashboard/customers-summary
   * Resumen de clientes
   */
  async getCustomersSummary(req: Request, res: Response): Promise<void> {
    try {
      const validated = dateRangeSchema.parse(req.query);
      const result = await dashboardService.getCustomersSummary(validated);

      const response: IApiResponse<typeof result> = {
        success: true,
        data: result,
      };

      res.json(response);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Parámetros inválidos',
          details: error.issues,
        });
        return;
      }

      console.error('Error en getCustomersSummary:', error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener resumen de clientes',
      });
    }
  }

  /**
   * 7. GET /admin/dashboard/alerts
   * Alertas operativas
   */
  async getAlerts(req: Request, res: Response): Promise<void> {
    try {
      const result = await dashboardService.getAlerts();

      const response: IApiResponse<typeof result> = {
        success: true,
        data: result,
      };

      res.json(response);
    } catch (error) {
      console.error('Error en getAlerts:', error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener alertas',
      });
    }
  }
}

