/**
 * Middleware de validación y sanitización
 * 
 * Protege contra:
 * - XSS (Cross-Site Scripting)
 * - SQL Injection (validación de tipos)
 * - Inyección de datos maliciosos
 * 
 * Usa express-validator para validación robusta
 */

import { body, param, query, validationResult, ValidationChain } from 'express-validator';
import { Request, Response, NextFunction } from 'express';

/**
 * Sanitiza strings para prevenir XSS
 */
export function sanitizeString(value: string): string {
    if (typeof value !== 'string') {
        return '';
    }
    
    return value
        .replace(/[<>]/g, '') // Remover < y >
        .trim()
        .substring(0, 10000); // Limitar longitud máxima
}

/**
 * Sanitiza números
 */
export function sanitizeNumber(value: any): number | null {
    if (value === null || value === undefined) {
        return null;
    }
    
    const num = Number(value);
    return isNaN(num) ? null : num;
}

/**
 * Sanitiza emails
 */
export function sanitizeEmail(value: string): string {
    if (typeof value !== 'string') {
        return '';
    }
    
    // Validar formato básico de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const cleaned = value.trim().toLowerCase();
    
    return emailRegex.test(cleaned) ? cleaned : '';
}

/**
 * Middleware para manejar errores de validación
 */
export function handleValidationErrors(req: Request, res: Response, next: NextFunction) {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            error: 'Error de validación',
            details: errors.array().map(err => ({
                field: err.type === 'field' ? err.path : 'unknown',
                message: err.msg,
            })),
        });
    }
    
    next();
}

/**
 * Validadores comunes reutilizables
 */
export const validators = {
    // ID numérico
    id: param('id').isInt({ min: 1 }).withMessage('ID debe ser un número entero positivo'),
    
    // Paginación
    page: query('page').optional().isInt({ min: 1 }).withMessage('Page debe ser un número entero positivo'),
    limit: query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit debe ser entre 1 y 100'),
    
    // Email
    email: body('email').isEmail().normalizeEmail().withMessage('Email inválido'),
    
    // String con longitud
    string: (field: string, min: number = 1, max: number = 255) => 
        body(field).isString().trim().isLength({ min, max }).withMessage(`${field} debe tener entre ${min} y ${max} caracteres`),
    
    // Número
    number: (field: string, min?: number, max?: number) => {
        let validator = body(field).isNumeric().withMessage(`${field} debe ser un número`);
        if (min !== undefined) {
            validator = validator.isFloat({ min }).withMessage(`${field} debe ser mayor o igual a ${min}`);
        }
        if (max !== undefined) {
            validator = validator.isFloat({ max }).withMessage(`${field} debe ser menor o igual a ${max}`);
        }
        return validator;
    },
    
    // Boolean
    boolean: (field: string) => 
        body(field).optional().isBoolean().withMessage(`${field} debe ser true o false`),
    
    // Enum
    enum: (field: string, values: string[]) => 
        body(field).isIn(values).withMessage(`${field} debe ser uno de: ${values.join(', ')}`),
};

/**
 * Middleware para sanitizar body automáticamente
 */
export function sanitizeBody(req: Request, res: Response, next: NextFunction) {
    if (req.body && typeof req.body === 'object') {
        // Sanitizar strings en el body
        for (const key in req.body) {
            if (typeof req.body[key] === 'string') {
                // No sanitizar campos que pueden contener HTML válido (como descripciones)
                const skipSanitize = ['descripcion', 'observaciones', 'htmlContent', 'textContent'];
                if (!skipSanitize.includes(key)) {
                    req.body[key] = sanitizeString(req.body[key]);
                }
            }
        }
    }
    
    next();
}

/**
 * Middleware para validar tamaño de payload
 */
export function validatePayloadSize(maxSize: number = 1024 * 1024) { // 1MB por defecto
    return (req: Request, res: Response, next: NextFunction) => {
        const contentLength = parseInt(req.headers['content-length'] || '0');
        
        if (contentLength > maxSize) {
            return res.status(413).json({
                success: false,
                error: `Payload demasiado grande. Tamaño máximo: ${maxSize / 1024 / 1024}MB`,
            });
        }
        
        next();
    };
}
