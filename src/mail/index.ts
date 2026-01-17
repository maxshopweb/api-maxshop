/**
 * Exportaciones del módulo de mails
 * Punto de entrada centralizado para el sistema de emails
 */

// Servicio principal
export { mailService, MailService } from './mail.service';
import { mailService } from './mail.service';
export default mailService;

// Cliente de Brevo
export { brevoClient, BrevoClient } from './brevo.client';

// Eventos y tipos
export { MailEventType, MailEventNames, isValidMailEvent } from './mail.events';
export type {
    MailChannel,
    MailRecipient,
    MailEventData,
    MailPayload,
    BrevoResponse,
    MailSender,
    MailTemplate,
    OrderEventData,
    ShippingEventData,
    PromotionEventData,
    AbandonedCartEventData,
} from './mail.types';

// Templates (exportación opcional si se necesita acceso directo)
export { getMailTemplate } from './mail.templates';

