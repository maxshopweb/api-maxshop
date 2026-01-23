import { Router } from 'express';
import dbfConverterController from '../controllers/dbf-converter.controller';
import { sincronizarBases } from '../scripts/sincronizar-bases';

const router = Router();

/**
 * POST /api/dbf-converter/convert
 * Convierte un archivo DBF subido a CSV
 * Body: multipart/form-data con campo 'dbfFile'
 */
router.post('/convert', dbfConverterController.convertDBF);

/**
 * POST /api/dbf-converter/sincronizar
 * Sincroniza todas las bases desde el FTP y las convierte a CSV
 */
router.post('/sincronizar', async (req, res) => {
  try {
    await sincronizarBases();
    res.json({
      success: true,
      message: 'Sincronización completada exitosamente',
    });
  } catch (error) {
    console.error('Error en sincronización:', error);
    res.status(500).json({
      success: false,
      message: 'Error al sincronizar bases',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
