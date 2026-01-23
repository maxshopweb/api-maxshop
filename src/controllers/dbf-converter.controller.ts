import { Request, Response } from 'express';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import dbfConverterService from '../services/dbf-converter.service';

// Configurar multer para subir archivos
const upload = multer({
  dest: path.join(__dirname, '../../temp/uploads'),
  fileFilter: (req, file, cb) => {
    // Solo aceptar archivos .DBF
    if (file.originalname.toLowerCase().endsWith('.dbf')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos .DBF'));
    }
  },
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB máximo
  },
});

export class DBFConverterController {
  /**
   * Convierte un archivo DBF subido a CSV
   * POST /api/dbf-converter/convert
   */
  convertDBF = [
    upload.single('dbfFile'),
    async (req: Request, res: Response): Promise<void> => {
      try {
        if (!req.file) {
          res.status(400).json({
            success: false,
            message: 'No se proporcionó ningún archivo .DBF',
          });
          return;
        }

        const uploadedFile = req.file;
        const csvOutputDir = path.join(__dirname, '../../data/csv');
        
        // Asegurar que el directorio existe
        if (!fs.existsSync(csvOutputDir)) {
          fs.mkdirSync(csvOutputDir, { recursive: true });
        }

        // Generar nombre del archivo CSV
        const csvFileName = path.basename(uploadedFile.originalname, '.dbf') + '.csv';
        const csvPath = path.join(csvOutputDir, csvFileName);

        // Convertir DBF a CSV
        await dbfConverterService.convertDBFtoCSV(uploadedFile.path, csvPath);

        // Eliminar el archivo temporal subido
        fs.unlinkSync(uploadedFile.path);

        res.json({
          success: true,
          message: 'Archivo convertido exitosamente',
          data: {
            originalFile: uploadedFile.originalname,
            csvFile: csvFileName,
            csvPath: csvPath,
          },
        });
      } catch (error) {
        // Limpiar archivo temporal si existe
        if (req.file && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }

        console.error('Error al convertir DBF:', error);
        res.status(500).json({
          success: false,
          message: 'Error al convertir el archivo DBF',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  ];
}

export default new DBFConverterController();
