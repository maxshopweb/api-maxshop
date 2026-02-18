import { Router } from 'express';
import { ProductosController } from '../controllers/productos.controller';
import {
    verifyFirebaseToken,
    requireAuthenticatedUser,
    loadUserFromDatabase,
    requireRole,
} from '../middlewares/auth.middleware';
import { 
    validarProductoActivo, 
    validarStockDisponible, 
    validarRelacionesProducto 
} from '../middlewares/validarProducto.middleware';

const router = Router();
const productosController = new ProductosController();

const adminAuth = [
    verifyFirebaseToken,
    requireAuthenticatedUser,
    loadUserFromDatabase,
    requireRole('ADMIN'),
];

// Rutas para obtener datos del formulario (sin middleware)
router.get('/contenido-crear', productosController.getContenidoCrearProducto.bind(productosController));

// Rutas especiales (sin middleware de validación individual)
router.get('/destacados', productosController.getDestacados.bind(productosController));
router.get('/stock-bajo', productosController.getStockBajo.bind(productosController));
router.get('/con-imagenes', productosController.getProductosConImagenes.bind(productosController));
router.get('/tienda', productosController.getProductosTienda.bind(productosController)); // Tienda: solo activos + publicados; filtros opcionales

// Rutas CRUD generales
router.get('/', productosController.getAll.bind(productosController));

// GET por código: buscar por codi_arti
router.get('/codigo/:codigo', productosController.getByCodigo.bind(productosController));

// GET por ID: validar que el producto esté activo
router.get('/:id', 
    validarProductoActivo,
    productosController.getById.bind(productosController)
);

// POST crear: solo admin, validar relaciones (marca, subcategoría, IVA)
router.post('/',
    adminAuth,
    validarRelacionesProducto,
    productosController.create.bind(productosController)
);

// PUT actualizar: solo admin, validar que el producto esté activo y relaciones
router.put('/:id',
    adminAuth,
    validarProductoActivo,
    validarRelacionesProducto,
    productosController.update.bind(productosController)
);

// DELETE: solo admin, validar que el producto esté activo antes de hacer soft delete
router.delete('/:id',
    adminAuth,
    validarProductoActivo,
    productosController.delete.bind(productosController)
);

// PATCH stock: solo admin
router.patch('/:id/stock',
    adminAuth,
    validarProductoActivo,
    productosController.updateStock.bind(productosController)
);

// PATCH /api/productos/:id/destacado: solo admin
router.patch('/:id/destacado',
    adminAuth,
    validarProductoActivo,
    productosController.toggleDestacado.bind(productosController)
);

// PATCH /api/productos/bulk/publicado: solo admin (debe ir antes de /:id)
router.patch('/bulk/publicado', adminAuth, productosController.bulkSetPublicado.bind(productosController));

// PATCH /api/productos/:id/publicado: solo admin
router.patch('/:id/publicado',
    adminAuth,
    validarProductoActivo,
    productosController.togglePublicado.bind(productosController)
);

//! AGREGAR PRODUCTOS EN OFERTA

export default router;
