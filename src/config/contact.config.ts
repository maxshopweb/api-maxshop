export const CONTACT_CONFIG = {
    whatsapp: {
        number: process.env.WHATSAPP_NUMBER || '+5491178922225',
        display: process.env.WHATSAPP_DISPLAY || '+54 9 11 7892-2225',
    },
    email: {
        address: process.env.CONTACT_EMAIL || 'info@maxshop.com',
        href: `mailto:${process.env.CONTACT_EMAIL || 'info@maxshop.com'}`,
    },
    advisor: {
        whatsappMessage: 'Hola! Tengo una consulta sobre MaxShop.',
    },
} as const;

export function buildWhatsappUrl(message?: string): string {
    const digits = CONTACT_CONFIG.whatsapp.number.replace(/\D/g, '');
    if (!message) return `https://wa.me/${digits}`;
    return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
