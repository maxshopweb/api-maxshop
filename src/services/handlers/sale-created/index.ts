/**
 * Handlers para el evento SALE_CREATED
 * 
 * Este archivo exporta todos los handlers que se ejecutan cuando
 * se emite el evento SALE_CREATED (venta aprobada)
 */

import { IEventHandler } from '../handler.interface';
import { SaleCreatedPayload } from '../../../domain/events/sale.events';
import { TestHandler } from './test.handler';
import { AndreaniHandler } from './andreani.handler';
import { ExcelHandler } from './excel.handler';
import { FacturaPendienteHandler } from './factura-pendiente.handler';
// Futuros handlers (comentados hasta implementarlos):
// import { AuditHandler } from './audit.handler';
// import { FTPHandler } from './ftp.handler';
// import { EmailHandler } from './email.handler';
// import { CacheHandler } from './cache.handler';

/**
 * Lista de handlers para SALE_CREATED
 * Ordenados por prioridad (menor = primero)
 */
export const saleCreatedHandlers: IEventHandler<SaleCreatedPayload>[] = [
    new TestHandler(),              // Prioridad 1 - Handler de prueba
    new AndreaniHandler(),          // Prioridad 20 - Crear pre-envío en Andreani
    new ExcelHandler(),             // Prioridad 30 - Generar Excel y subir a FTP
    new FacturaPendienteHandler(),  // Prioridad 40 - Marcar venta como pendiente de factura
    // Futuros handlers (agregar aquí cuando se implementen):
    // new AuditHandler(),      // Prioridad 10 - Registrar en event_logs
    // new EmailHandler(),      // Prioridad 50 - Notificar cliente
    // new CacheHandler(),      // Prioridad 100 - Invalidar cache
];
