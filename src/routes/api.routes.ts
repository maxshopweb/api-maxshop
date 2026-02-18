import { Router } from 'express';
import productosRoutes from './productos.routes';
import marcasRoutes from './marcas.routes';
import categoriasRoutes from './categorias.routes';
import gruposRoutes from './grupos.routes';
import listasPrecioRoutes from './listas-precio.routes';
import situacionFiscalRoutes from './situacion-fiscal.routes';
import authRoutes from './auth.routes';
import ventasRoutes from './ventas.routes';
import vencimientoRoutes from './vencimiento.routes';
import clientesRoutes from './clientes.routes';
import andreaniRoutes from './andreani.routes';
import dashboardRoutes from './dashboard.routes';
import direccionesRoutes from './direcciones.routes';
import locationRoutes from './location.routes';
import webhookRoutes from './webhook.routes';
import dbfConverterRoutes from './dbf-converter.routes';
import sincronizacionRoutes from './sincronizacion.routes';
import facturasRoutes from './facturas.routes';
import healthRoutes from './health.routes';
import uploadRoutes from './upload.routes';
import configTiendaRoutes from './config-tienda.routes';
import auditoriaRoutes from './auditoria.routes';
import { publicRateLimiter, webhookRateLimiter } from '../middlewares/rate-limit.middleware';

const apiRoutes = Router();

// Health check (sin rate limiting, debe ser rápido)
apiRoutes.use('/health', healthRoutes);

// Rate limiting global para todas las rutas API
apiRoutes.use(publicRateLimiter);

// Rutas públicas (sin autenticación)
apiRoutes.use('/auth', authRoutes);
apiRoutes.use('/productos', productosRoutes);
apiRoutes.use('/config/tienda', configTiendaRoutes);
apiRoutes.use('/location', locationRoutes);

// Webhooks (rate limiting especial)
apiRoutes.use('/webhooks', webhookRateLimiter, webhookRoutes);

// Rutas que requieren autenticación (rate limiting aplicado por ruta específica)
apiRoutes.use('/marcas', marcasRoutes);
apiRoutes.use('/categorias', categoriasRoutes);
apiRoutes.use('/grupos', gruposRoutes);
apiRoutes.use('/listas-precio', listasPrecioRoutes);
apiRoutes.use('/situacion-fiscal', situacionFiscalRoutes);
apiRoutes.use('/ventas', vencimientoRoutes);
apiRoutes.use('/ventas', ventasRoutes);
apiRoutes.use('/clientes', clientesRoutes);
apiRoutes.use('/andreani', andreaniRoutes);
apiRoutes.use('/admin/dashboard', dashboardRoutes);
apiRoutes.use('/admin/auditoria', auditoriaRoutes);
apiRoutes.use('/direcciones', direccionesRoutes);
apiRoutes.use('/dbf-converter', dbfConverterRoutes);
apiRoutes.use('/sincronizacion', sincronizacionRoutes);
apiRoutes.use('/facturas', facturasRoutes);
apiRoutes.use('/upload', uploadRoutes);

export default apiRoutes;   
