import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { createServer } from 'http';
import apiRoutes from './routes/api.routes';
import redisClient from './config/redis.config';
import { sanitizeBody, validatePayloadSize } from './middlewares/validation.middleware';

import { websocketServer } from './infrastructure/websocket/websocket.server';

// Cargar variables de entorno primero
dotenv.config();

// Inicializar Brevo Client (se ejecuta el constructor y muestra el estado)
// Solo cargar en desarrollo local
if (process.env.VERCEL !== '1') {
    import('./mail');
}

export const prisma = new PrismaClient();

const app: Application = express();

// ============================================
// SEGURIDAD: Helmet avanzado
// ============================================
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:", "http:"], // Permitir imágenes de cualquier origen
            scriptSrc: ["'self'"],
            connectSrc: ["'self'", process.env.FRONTEND_URL || 'http://localhost:3000'],
        },
    },
    hsts: {
        maxAge: 31536000, // 1 año
        includeSubDomains: true,
        preload: true,
    },
    xFrameOptions: { action: 'deny' },
    xContentTypeOptions: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// ============================================
// CORS
// ============================================
const allowedOrigins = [
    process.env.FRONTEND_URL || 'https://maxshop-cyan.vercel.app',
    'https://www.maxshop.com.ar',
    
];

// En desarrollo, permitir localhost
if (process.env.NODE_ENV === 'development') {
    allowedOrigins.push('http://localhost:3000', 'http://192.168.0.13:3000');
}

app.use(cors({
    origin: (origin, callback) => {
        // Permitir requests sin origin (mobile apps, Postman, etc.)
        if (!origin) {
            return callback(null, true);
        }
        
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.warn(`⚠️ [CORS] Origen no permitido: ${origin}`);
            callback(new Error('No permitido por CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Guest-Device-Id'],
    credentials: true,
    maxAge: 86400, // 24 horas
}));

// ============================================
// COMPRESIÓN
// ============================================
app.use(compression({
    filter: (req, res) => {
        // Comprimir todo excepto si el cliente no lo soporta
        if (req.headers['x-no-compression']) {
            return false;
        }
        return compression.filter(req, res);
    },
    level: 6, // Balance entre compresión y velocidad
}));

// ============================================
// PARSING Y VALIDACIÓN
// ============================================
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' })); // Límite de 10MB para JSON
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Sanitización automática de body
app.use(sanitizeBody);

// Validar tamaño de payload
app.use(validatePayloadSize(10 * 1024 * 1024)); // 10MB máximo

app.use(apiRoutes);

// Exportar app para Vercel Serverless
export default app;

// Solo iniciar servidor local si no está en Vercel
if (process.env.VERCEL !== '1') {
    const httpServer = createServer(app);
    const PORT = process.env.PORT || 3000;

    const startServer = async () => {
        try {
            await prisma.$connect();

            // await redisClient.ping();

            // Inicializar WebSocket Server
            websocketServer.initialize(httpServer);

            // Inicializar servicio de retry de webhooks fallidos (después de que Prisma esté listo)
            const { failedWebhookRetryService } = require('./services/failed-webhook-retry.service');
            failedWebhookRetryService.start();
            console.log('✅ [Server] Servicio de retry de webhooks iniciado');

            // Inicializar handlers del Event Bus
            const { handlerExecutorService } = require('./services/handlers/handler-executor.service');
            handlerExecutorService.initialize();

            // Inicializar worker de sincronización de facturas
            const { facturaSyncWorker } = require('./services/factura-sync-worker.service');
            facturaSyncWorker.start();
            console.log('✅ [Server] Worker de sincronización de facturas iniciado');

            // Inicializar worker de sincronización de catálogo (FTP → CSV → BD): al arranque + cada 20 min
            const { catalogoSyncWorker } = require('./services/catalogo-sync-worker.service');
            catalogoSyncWorker.start();
            console.log('✅ [Server] Worker de sincronización de catálogo iniciado (arranque + cada 20 min)');

            // Cron de vencimiento de ventas pendientes (02:00 diario)
            const { startVencimientoCron } = require('./services/vencimiento.cron');
            startVencimientoCron();
            console.log('✅ [Server] Cron de vencimiento de ventas iniciado (02:00)');

            httpServer.listen(PORT);
        } catch (error) {
            console.error('❌ Error al iniciar el servidor:', error);
            process.exit(1);
        }
    };

    process.on('SIGINT', async () => {
        // Cerrar WebSocket Server
        websocketServer.close();
        
        // Cerrar servicio de retry de webhooks
        const { failedWebhookRetryService } = require('./services/failed-webhook-retry.service');
        failedWebhookRetryService.stop();
        
        // Cerrar worker de sincronización de facturas
        const { facturaSyncWorker } = require('./services/factura-sync-worker.service');
        facturaSyncWorker.stop();

        const { catalogoSyncWorker } = require('./services/catalogo-sync-worker.service');
        catalogoSyncWorker.stop();

        const { stopVencimientoCron } = require('./services/vencimiento.cron');
        stopVencimientoCron();

        // Cerrar Event Bus (cierra conexiones Redis)
        const { eventBus } = require('./infrastructure/event-bus/event-bus');
        await eventBus.close();
        
        await prisma.$disconnect();
        // await redisClient.quit();
        
        process.exit(0);
    });

    startServer();
}
