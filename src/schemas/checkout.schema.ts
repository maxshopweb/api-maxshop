import { z } from 'zod';

export const checkoutBodySchema = z.object({
  id_cliente: z.string().trim().min(1).max(128).optional(),
  metodo_pago: z.string().trim().min(2).max(32),
  observaciones: z.string().trim().max(500).optional(),
  costo_envio: z.number().finite().min(0).max(2_000_000).optional(),
  id_direccion: z.string().trim().min(1).max(128).optional(),
  tipo_documento: z.string().trim().min(2).max(32).optional(),
  numero_documento: z.string().trim().min(3).max(32).optional(),
  referencia_facturacion: z.string().trim().max(100).optional(),
  direccion: z.object({
    direccion: z.string().trim().max(200).optional(),
    altura: z.string().trim().max(20).optional(),
    piso: z.string().trim().max(10).optional(),
    dpto: z.string().trim().max(10).optional(),
    ciudad: z.string().trim().max(80).optional(),
    provincia: z.string().trim().max(80).optional(),
    cod_postal: z.number().int().min(0).max(100000).nullable().optional(),
    telefono: z.string().trim().max(30).optional(),
  }).optional(),
  detalles: z.array(z.object({
    id_prod: z.number().int().positive(),
    cantidad: z.number().int().positive().max(1000),
    precio_unitario: z.number().finite().min(0).max(100_000_000).optional(),
    descuento_aplicado: z.number().finite().min(0).max(100_000_000).optional(),
    bonificacion_porcentaje: z.number().finite().min(0).max(100).optional(),
  })).min(1).max(200),
}).strict();
