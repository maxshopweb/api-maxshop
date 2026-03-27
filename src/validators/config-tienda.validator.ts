import { body, ValidationChain } from 'express-validator';

const MAX = {
  banco: 100,
  tipo_cuenta: 50,
  numero_cuenta: 50,
  cbu: 22,
  alias: 50,
  titular: 255,
  cuit: 50,
  instrucciones: 500,
} as const;

/**
 * Validación para PUT /config/tienda.
 * Campos de reglas y datos_bancarios opcionales; longitudes acotadas.
 */
export function configTiendaUpdateValidators(): ValidationChain[] {
  return [
    body('envio_gratis_minimo')
      .optional()
      .isNumeric()
      .withMessage('envio_gratis_minimo debe ser numérico')
      .toFloat(),
    body('envio_gratis_activo')
      .optional()
      .isBoolean({ strict: true })
      .withMessage('envio_gratis_activo debe ser booleano')
      .toBoolean(),
    body('cuotas_sin_interes')
      .optional()
      .isInt({ min: 0, max: 24 })
      .withMessage('cuotas_sin_interes debe ser entero entre 0 y 24')
      .toInt(),
    body('cuotas_sin_interes_activo')
      .optional()
      .isBoolean({ strict: true })
      .withMessage('cuotas_sin_interes_activo debe ser booleano')
      .toBoolean(),
    body('cuotas_sin_interes_minimo')
      .optional()
      .isNumeric()
      .withMessage('cuotas_sin_interes_minimo debe ser numérico')
      .toFloat(),
    body('datos_bancarios')
      .optional()
      .custom((v) => v === null || (typeof v === 'object' && v !== null && !Array.isArray(v)))
      .withMessage('datos_bancarios debe ser un objeto o null'),
    body('datos_bancarios.banco')
      .optional()
      .isString()
      .trim()
      .isLength({ max: MAX.banco })
      .withMessage(`banco máximo ${MAX.banco} caracteres`),
    body('datos_bancarios.tipo_cuenta')
      .optional()
      .isString()
      .trim()
      .isLength({ max: MAX.tipo_cuenta })
      .withMessage(`tipo_cuenta máximo ${MAX.tipo_cuenta} caracteres`),
    body('datos_bancarios.numero_cuenta')
      .optional()
      .isString()
      .trim()
      .isLength({ max: MAX.numero_cuenta })
      .withMessage(`numero_cuenta máximo ${MAX.numero_cuenta} caracteres`),
    body('datos_bancarios.cbu')
      .optional()
      .isString()
      .trim()
      .isLength({ max: MAX.cbu })
      .withMessage(`cbu máximo ${MAX.cbu} caracteres`),
    body('datos_bancarios.alias')
      .optional()
      .isString()
      .trim()
      .isLength({ max: MAX.alias })
      .withMessage(`alias máximo ${MAX.alias} caracteres`),
    body('datos_bancarios.titular')
      .optional()
      .isString()
      .trim()
      .isLength({ max: MAX.titular })
      .withMessage(`titular máximo ${MAX.titular} caracteres`),
    body('datos_bancarios.cuit')
      .optional()
      .isString()
      .trim()
      .isLength({ max: MAX.cuit })
      .withMessage(`cuit máximo ${MAX.cuit} caracteres`),
    body('datos_bancarios.instrucciones')
      .optional()
      .isString()
      .trim()
      .isLength({ max: MAX.instrucciones })
      .withMessage(`instrucciones máximo ${MAX.instrucciones} caracteres`),
  ];
}
