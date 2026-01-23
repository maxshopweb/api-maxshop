import { Router } from 'express';
import productosRoutes from './productos.routes';
import marcasRoutes from './marcas.routes';
import categoriasRoutes from './categorias.routes';
import gruposRoutes from './grupos.routes';
import authRoutes from './auth.routes';
import ventasRoutes from './ventas.routes';
import clientesRoutes from './clientes.routes';
import andreaniRoutes from './andreani.routes';
import dashboardRoutes from './dashboard.routes';
import direccionesRoutes from './direcciones.routes';
import locationRoutes from './location.routes';
import webhookRoutes from './webhook.routes';
import dbfConverterRoutes from './dbf-converter.routes';
import sincronizacionRoutes from './sincronizacion.routes';

const apiRoutes = Router();

apiRoutes.use('/auth', authRoutes);
apiRoutes.use('/productos', productosRoutes);
apiRoutes.use('/marcas', marcasRoutes);
apiRoutes.use('/categorias', categoriasRoutes);
apiRoutes.use('/grupos', gruposRoutes);
apiRoutes.use('/ventas', ventasRoutes);
apiRoutes.use('/clientes', clientesRoutes);
apiRoutes.use('/andreani', andreaniRoutes);
apiRoutes.use('/admin/dashboard', dashboardRoutes);
apiRoutes.use('/direcciones', direccionesRoutes);
apiRoutes.use('/location', locationRoutes);
apiRoutes.use('/webhooks', webhookRoutes);
apiRoutes.use('/dbf-converter', dbfConverterRoutes);
apiRoutes.use('/sincronizacion', sincronizacionRoutes);


export default apiRoutes;   
