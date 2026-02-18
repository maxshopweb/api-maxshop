import { Request, Response } from 'express';
import { expirarVentasPendientes, aprobarVentaVencida } from '../services/vencimiento.service';

/**
 * POST /ventas/expirar
 * Ejecuta el job de vencimiento de ventas pendientes. Solo admin.
 */
export async function expirarVentas(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const auditContext = req.authenticatedUser
      ? {
          userId: req.authenticatedUser.id,
          userAgent: req.headers['user-agent']?.toString() ?? null,
          endpoint: req.originalUrl,
        }
      : undefined;
    const result = await expirarVentasPendientes(auditContext);
    res.status(200).json({
      success: true,
      data: {
        vencidasCount: result.vencidasCount,
        ids: result.ids,
        duracionMs: result.duracionMs,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error al expirar ventas';
    console.error('[vencimiento.controller]', error);
    res.status(500).json({
      success: false,
      error: message,
    });
  }
}

/**
 * POST /ventas/:id/aprobar-desde-vencido
 * Revoca vencimiento: solo permite pasar de 'vencido' a 'aprobado'. Solo admin.
 */
export async function aprobarDesdeVencido(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ success: false, error: 'ID de venta inválido' });
      return;
    }

    const auditContext = req.authenticatedUser
      ? {
          userId: req.authenticatedUser.id,
          userAgent: req.headers['user-agent']?.toString() ?? null,
          endpoint: req.originalUrl,
        }
      : undefined;

    const result = await aprobarVentaVencida(id, auditContext);
    res.status(200).json({
      success: true,
      data: result.venta ?? result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error al aprobar venta vencida';
    if (message.includes('no encontrada')) {
      res.status(404).json({ success: false, error: message });
      return;
    }
    if (message.includes('Solo se puede aprobar')) {
      res.status(400).json({ success: false, error: message });
      return;
    }
    console.error('[vencimiento.controller] aprobarDesdeVencido', error);
    res.status(500).json({ success: false, error: message });
  }
}
