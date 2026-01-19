/**
 * WebSocket Server
 * 
 * Maneja conexiones WebSocket para notificaciones en tiempo real
 * - Autenticación con Firebase Admin
 * - Solo admins pueden conectarse
 * - Escucha eventos del Event Bus y los propaga a los clientes
 */

import { Server as HTTPServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { firebaseAdminAuth } from '../../lib/firebaseAdmin';
import { prisma } from '../../index';
import { eventBus } from '../event-bus/event-bus';
import { SaleEventType } from '../../domain/events/sale.events';

interface AuthenticatedWebSocket extends WebSocket {
  isAuthenticated?: boolean;
  userId?: string;
  userRole?: string;
}

/**
 * Clase para manejar el servidor WebSocket
 */
export class WebSocketServerManager {
  private wss: WebSocketServer | null = null;
  private clients: Set<AuthenticatedWebSocket> = new Set();

  /**
   * Inicializa el servidor WebSocket
   */
  initialize(server: HTTPServer): void {
    this.wss = new WebSocketServer({
      server,
      path: '/ws',
    });

    this.wss.on('connection', (ws: AuthenticatedWebSocket) => {
      this.handleConnection(ws);
    });

    // Suscribirse a eventos del Event Bus
    this.subscribeToEvents();

  }

  /**
   * Maneja una nueva conexión WebSocket
   */
  private async handleConnection(ws: AuthenticatedWebSocket): Promise<void> {
    ws.isAuthenticated = false;
    this.clients.add(ws);


    // Esperar mensaje de autenticación
    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === 'auth' && message.token) {
          await this.authenticateClient(ws, message.token);
        } else if (!ws.isAuthenticated) {
          ws.close(1008, 'No autenticado');
        }
      } catch (error) {
        console.error('❌ [WebSocket] Error al procesar mensaje:', error);
        if (!ws.isAuthenticated) {
          ws.close(1008, 'Error de autenticación');
        }
      }
    });

    // Manejar desconexión
    ws.on('close', () => {
      this.clients.delete(ws);
    });

    // Manejar errores
    ws.on('error', (error: Error) => {
      console.error('❌ [WebSocket] Error en conexión:', error);
      this.clients.delete(ws);
    });

    // Enviar mensaje de bienvenida
    this.sendMessage(ws, {
      type: 'welcome',
      message: 'Conectado. Envía tu token para autenticarte.',
    });
  }

  /**
   * Autentica un cliente WebSocket
   */
  private async authenticateClient(ws: AuthenticatedWebSocket, token: string): Promise<void> {
    try {
      if (!firebaseAdminAuth) {
        throw new Error('Firebase Admin no está configurado');
      }

      // Verificar token Firebase
      const decodedToken = await firebaseAdminAuth.verifyIdToken(token, true);

      // Obtener usuario de la base de datos
      const user = await prisma.usuarios.findUnique({
        where: { id_usuario: decodedToken.uid },
        include: { roles: true },
      });

      if (!user) {
        throw new Error('Usuario no encontrado');
      }

      // Verificar que sea admin
      const roleName = user.roles?.nombre?.toUpperCase();
      if (roleName !== 'ADMIN') {
        ws.close(1008, 'Solo administradores pueden conectarse');
        return;
      }

      // Autenticación exitosa
      ws.isAuthenticated = true;
      ws.userId = user.id_usuario;
      ws.userRole = roleName;

      this.sendMessage(ws, {
        type: 'auth_success',
        message: 'Autenticación exitosa',
      });

    } catch (error: any) {
      console.error('❌ [WebSocket] Error de autenticación:', error.message);
      this.sendMessage(ws, {
        type: 'auth_error',
        message: error.message || 'Error de autenticación',
      });
      ws.close(1008, 'Error de autenticación');
    }
  }

  /**
   * Suscribe a eventos del Event Bus
   */
  private subscribeToEvents(): void {
    // Escuchar eventos de ventas
    eventBus.on(SaleEventType.SALE_CREATED, (payload) => {
      this.broadcastToAdmins({
        type: 'event',
        event: SaleEventType.SALE_CREATED,
        payload,
      });
    });

    // Preparado para futuros eventos:
    // eventBus.on(SaleEventType.SALE_UPDATED, (payload) => { ... });
  }

  /**
   * Envía un mensaje a un cliente específico
   */
  private sendMessage(ws: AuthenticatedWebSocket, message: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        console.error('❌ [WebSocket] Error al enviar mensaje:', error);
      }
    }
  }

  /**
   * Transmite un mensaje a todos los admins autenticados
   */
  private broadcastToAdmins(message: any): void {
    const authenticatedClients = Array.from(this.clients).filter(
      (ws) => ws.isAuthenticated && ws.readyState === WebSocket.OPEN
    );

    if (authenticatedClients.length === 0) {
      return; // No hay admins conectados
    }

    const messageStr = JSON.stringify(message);
    let sentCount = 0;

    authenticatedClients.forEach((ws) => {
      try {
        ws.send(messageStr);
        sentCount++;
      } catch (error) {
        console.error('❌ [WebSocket] Error al transmitir mensaje:', error);
      }
    });

  }

  /**
   * Obtiene el número de clientes conectados
   */
  getConnectedClientsCount(): number {
    return Array.from(this.clients).filter((ws) => ws.isAuthenticated).length;
  }

  /**
   * Cierra todas las conexiones
   */
  close(): void {
    this.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });
    this.clients.clear();

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
  }
}

// Exportar instancia singleton
export const websocketServer = new WebSocketServerManager();

