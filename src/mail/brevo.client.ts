import { BrevoResponse, MailRecipient, MailSender, MailTemplate } from './mail.types';

/**
 * Payload para la API de Brevo
 */
interface BrevoEmailPayload {
    sender: MailSender;
    to: Array<{ email: string; name?: string }>;
    subject: string;
    htmlContent: string;
    textContent?: string;
    cc?: Array<{ email: string; name?: string }>;
    bcc?: Array<{ email: string; name?: string }>;
    replyTo?: { email: string; name?: string };
    tags?: string[];
    scheduledAt?: string; // ISO 8601 format
    params?: Record<string, any>; // Para templates dinámicos
}

/**
 * Cliente para interactuar con Brevo API
 */
export class BrevoClient {
    private readonly apiKey: string;
    private readonly baseUrl: string = 'https://api.brevo.com/v3';
    private readonly sender: MailSender;

    constructor() {
        this.apiKey = process.env.BREVO_API_KEY || '';
        const senderEmail = process.env.BREVO_SENDER_EMAIL || '';
        const senderName = process.env.BREVO_SENDER_NAME || 'MaxShop';

        this.sender = {
            email: senderEmail,
            name: senderName,
        };

        // Mostrar estado de configuración al inicializar
        if (this.isConfigured()) {
        } else {
            if (!this.apiKey) {
                console.warn('⚠️ [BrevoClient] BREVO_API_KEY no configurada. Los emails no se enviarán.');
            }
            if (!senderEmail) {
                console.warn('⚠️ [BrevoClient] BREVO_SENDER_EMAIL no configurada. Los emails no se enviarán.');
            }
        }
    }

    /**
     * Envía un email transaccional usando Brevo API
     */
    async sendTransactionalEmail(
        template: MailTemplate,
        recipients: MailRecipient | MailRecipient[],
        options?: {
            cc?: MailRecipient[];
            bcc?: MailRecipient[];
            replyTo?: MailRecipient;
            tags?: string[];
            scheduledAt?: Date;
            params?: Record<string, any>;
        }
    ): Promise<BrevoResponse> {
        if (!this.apiKey) {
            throw new Error('BREVO_API_KEY no configurada');
        }

        // Normalizar destinatarios a array
        const toArray = Array.isArray(recipients) ? recipients : [recipients];

        // Construir payload
        const payload: BrevoEmailPayload = {
            sender: this.sender,
            to: toArray.map((r) => ({
                email: r.email,
                name: r.name,
            })),
            subject: template.subject,
            htmlContent: template.htmlContent,
            ...(template.textContent && { textContent: template.textContent }),
            ...(options?.cc && {
                cc: options.cc.map((r) => ({
                    email: r.email,
                    name: r.name,
                })),
            }),
            ...(options?.bcc && {
                bcc: options.bcc.map((r) => ({
                    email: r.email,
                    name: r.name,
                })),
            }),
            ...(options?.replyTo && {
                replyTo: {
                    email: options.replyTo.email,
                    name: options.replyTo.name,
                },
            }),
            ...(options?.tags && { tags: options.tags }),
            ...(options?.scheduledAt && {
                scheduledAt: options.scheduledAt.toISOString(),
            }),
            ...(options?.params && { params: options.params }),
        };

        try {
            const response = await fetch(`${this.baseUrl}/smtp/email`, {
                method: 'POST',
                headers: {
                    'api-key': this.apiKey,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(
                    `Brevo API error: ${response.status} ${response.statusText}. ${JSON.stringify(errorData)}`
                );
            }

            const data = await response.json() as { messageId?: string };

            return {
                messageId: data.messageId || 'unknown',
            };
        } catch (error) {
            console.error('❌ [BrevoClient] Error al enviar email:', error);
            throw error;
        }
    }

    /**
     * Obtiene el remitente configurado
     */
    getSender(): MailSender {
        return this.sender;
    }

    /**
     * Envía un email transaccional con adjuntos usando Brevo API
     * Brevo requiere JSON con el contenido del archivo en base64
     */
    async sendTransactionalEmailWithAttachment(
        template: MailTemplate,
        recipients: MailRecipient | MailRecipient[],
        attachmentPath: string,
        attachmentName: string,
        options?: {
            cc?: MailRecipient[];
            bcc?: MailRecipient[];
            replyTo?: MailRecipient;
            tags?: string[];
            scheduledAt?: Date;
            params?: Record<string, any>;
        }
    ): Promise<BrevoResponse> {
        if (!this.apiKey) {
            throw new Error('BREVO_API_KEY no configurada');
        }

        // Normalizar destinatarios a array
        const toArray = Array.isArray(recipients) ? recipients : [recipients];

        // Leer archivo como buffer y convertir a base64
        const fs = require('fs');
        if (!fs.existsSync(attachmentPath)) {
            throw new Error(`Archivo adjunto no existe: ${attachmentPath}`);
        }
        const fileBuffer = fs.readFileSync(attachmentPath);
        const fileBase64 = fileBuffer.toString('base64');

        // Construir payload JSON (Brevo requiere JSON, no FormData)
        const payload: any = {
            sender: this.sender,
            to: toArray.map((r) => ({
                email: r.email,
                name: r.name,
            })),
            subject: template.subject,
            htmlContent: template.htmlContent,
            attachment: [
                {
                    content: fileBase64,
                    name: attachmentName,
                },
            ],
        };

        // Agregar campos opcionales
        if (template.textContent) {
            payload.textContent = template.textContent;
        }
        if (options?.cc) {
            payload.cc = options.cc.map((r) => ({
                email: r.email,
                name: r.name,
            }));
        }
        if (options?.bcc) {
            payload.bcc = options.bcc.map((r) => ({
                email: r.email,
                name: r.name,
            }));
        }
        if (options?.replyTo) {
            payload.replyTo = {
                email: options.replyTo.email,
                name: options.replyTo.name,
            };
        }
        if (options?.tags) {
            payload.tags = options.tags;
        }
        if (options?.scheduledAt) {
            payload.scheduledAt = options.scheduledAt.toISOString();
        }
        if (options?.params) {
            payload.params = options.params;
        }

        try {
            const response = await fetch(`${this.baseUrl}/smtp/email`, {
                method: 'POST',
                headers: {
                    'api-key': this.apiKey,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(
                    `Brevo API error: ${response.status} ${response.statusText}. ${JSON.stringify(errorData)}`
                );
            }

            const data = await response.json() as { messageId?: string };

            return {
                messageId: data.messageId || 'unknown',
            };
        } catch (error) {
            console.error('❌ [BrevoClient] Error al enviar email con adjunto:', error);
            throw error;
        }
    }

    /**
     * Verifica si el cliente está configurado correctamente
     */
    isConfigured(): boolean {
        return !!this.apiKey && !!this.sender.email;
    }
}

// Instancia singleton del cliente
export const brevoClient = new BrevoClient();

