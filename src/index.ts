import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { createServer } from 'http';
import apiRoutes from './routes/api.routes';
import redisClient from './config/redis.config';

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

app.use(helmet());
app.use(cors({
    origin: [
        process.env.FRONTEND_URL || 'http://localhost:5173',
        'http://localhost:3000',
        'http://192.168.0.13:3000'
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use('/api', apiRoutes);

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
        
        // Cerrar Event Bus (cierra conexiones Redis)
        const { eventBus } = require('./infrastructure/event-bus/event-bus');
        await eventBus.close();
        
        await prisma.$disconnect();
        // await redisClient.quit();
        
        process.exit(0);
    });

    startServer();
}
