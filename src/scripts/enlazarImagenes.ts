/**
 * Script para enlazar imágenes a productos
 * Busca imágenes en client/public/imgs/productos/ingco/ que empiecen con codi_arti
 * y actualiza los productos con las rutas de las imágenes
 * Solo procesa imágenes que empiezan con codi_arti (números al inicio)
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// Resolver la ruta base del proyecto (raíz del workspace)
// __dirname apunta a api/dist/scripts/ o api/src/scripts/ dependiendo de si está compilado
// Necesitamos subir hasta la raíz del proyecto para acceder a client/
function getProjectRoot(): string {
  // Si estamos en api/dist/scripts/, subimos 3 niveles
  // Si estamos en api/src/scripts/, también subimos 3 niveles
  const apiDir = path.resolve(__dirname, '../../..');
  
  // Verificar si estamos en la estructura correcta
  // La raíz del proyecto debería tener tanto api/ como client/
  if (fs.existsSync(path.join(apiDir, 'client')) && fs.existsSync(path.join(apiDir, 'api'))) {
    return apiDir;
  }
  
  // Si no encontramos la estructura, intentar desde process.cwd()
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, 'client')) && fs.existsSync(path.join(cwd, 'api'))) {
    return cwd;
  }
  
  // Último recurso: asumir que estamos en api/ y subir un nivel
  return path.resolve(cwd, '..');
}

// Ruta base de las imágenes (solo carpeta ingco)
const PROJECT_ROOT = getProjectRoot();
const IMAGES_BASE_DIR = path.join(PROJECT_ROOT, 'client/public/imgs/productos/ingco');

/**
 * Extrae el codi_arti del nombre del archivo
 * Ejemplos:
 * - "620004-01.jpg" -> "620004"
 * - "620010-02.png" -> "620010"
 * - "633001-TALADRO..." -> "633001"
 * - "ingco/633001-TALADRO..." -> "633001"
 */
function extractCodiArti(fileName: string): string | null {
  // Remover la ruta del directorio si existe
  const baseName = path.basename(fileName);
  
  // Buscar el patrón: números al inicio del nombre
  const match = baseName.match(/^(\d+)/);
  if (match) {
    return match[1];
  }
  
  return null;
}

/**
 * Genera la ruta dinámica de la imagen
 * Ejemplos:
 * - "620004-01.jpg" -> "/imgs/productos/620004-01.jpg"
 * - "ingco/633001-TALADRO.jpg" -> "/imgs/productos/ingco/633001-TALADRO.jpg"
 */
function generateImagePath(filePath: string, baseDir: string): string {
  // Obtener la ruta relativa desde el directorio base
  const relativePath = path.relative(baseDir, filePath);
  
  // Normalizar separadores de ruta para web (usar /)
  const webPath = relativePath.replace(/\\/g, '/');
  
  // Asegurar que empiece con /imgs/productos/
  if (webPath.startsWith('imgs/productos/')) {
    return `/${webPath}`;
  }
  
  return `/imgs/productos/${webPath}`;
}

/**
 * Encuentra todas las imágenes en el directorio (solo archivos, sin subdirectorios)
 * Solo procesa imágenes que empiezan con codi_arti
 */
function findImages(dir: string, baseDir: string): Array<{ filePath: string; imagePath: string; codiArti: string }> {
  const results: Array<{ filePath: string; imagePath: string; codiArti: string }> = [];
  let ignoradas = 0;
  
  if (!fs.existsSync(dir)) {
    console.warn(`⚠️  Directorio no existe: ${dir}`);
    return results;
  }
  
  const items = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const item of items) {
    // Solo procesar archivos, ignorar subdirectorios
    if (item.isFile()) {
      const fullPath = path.join(dir, item.name);
      
      // Verificar si es una imagen
      const ext = path.extname(item.name).toLowerCase();
      if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) {
        // Extraer codi_arti del nombre del archivo
        const codiArti = extractCodiArti(item.name);
        
        // Solo procesar si empieza con codi_arti (tiene números al inicio)
        if (codiArti) {
          const imagePath = generateImagePath(fullPath, baseDir);
          results.push({
            filePath: fullPath,
            imagePath,
            codiArti
          });
        } else {
          // Ignorar imágenes que no empiezan con codi_arti
          ignoradas++;
        }
      }
    }
  }
  
  if (ignoradas > 0) {
    console.log(`  ⏭️  ${ignoradas} imágenes ignoradas (no empiezan con codi_arti)`);
  }
  
  return results;
}

/**
 * Agrupa imágenes por codi_arti
 */
function groupImagesByCodiArti(
  images: Array<{ filePath: string; imagePath: string; codiArti: string }>
): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  
  for (const img of images) {
    if (!grouped.has(img.codiArti)) {
      grouped.set(img.codiArti, []);
    }
    grouped.get(img.codiArti)!.push(img.imagePath);
  }
  
  // Ordenar imágenes por nombre para consistencia
  for (const [codiArti, paths] of grouped.entries()) {
    grouped.set(codiArti, paths.sort());
  }
  
  return grouped;
}

/**
 * Función principal
 */
async function enlazarImagenes() {
  console.log('🖼️  Iniciando enlace de imágenes a productos...\n');
  console.log(`📁 Buscando imágenes en: ${IMAGES_BASE_DIR}\n`);
  
  try {
    // 1. Buscar todas las imágenes que empiezan con codi_arti
    console.log('🔍 Buscando imágenes en carpeta ingco...');
    console.log(`📂 Directorio: ${IMAGES_BASE_DIR}\n`);
    const baseDirForPaths = path.join(PROJECT_ROOT, 'client/public/imgs/productos');
    const allImages = findImages(IMAGES_BASE_DIR, baseDirForPaths);
    console.log(`✓ Encontradas ${allImages.length} imágenes que empiezan con codi_arti\n`);
    
    if (allImages.length === 0) {
      console.log('⚠️  No se encontraron imágenes. Verifica la ruta del directorio.');
      return;
    }
    
    // 2. Agrupar imágenes por codi_arti
    console.log('📦 Agrupando imágenes por código de artículo...');
    const imagesByCodiArti = groupImagesByCodiArti(allImages);
    console.log(`✓ Encontrados ${imagesByCodiArti.size} códigos de artículo únicos\n`);
    
    // 3. Obtener todos los productos de la BD
    console.log('📥 Cargando productos de la base de datos...');
    const productos = await prisma.productos.findMany({
      select: {
        id_prod: true,
        codi_arti: true,
        nombre: true,
        img_principal: true,
        imagenes: true,
      },
    });
    
    const productosMap = new Map<string, typeof productos[0]>();
    productos.forEach(p => {
      if (p.codi_arti) {
        productosMap.set(p.codi_arti, p);
      }
    });
    
    console.log(`✓ Cargados ${productos.length} productos de la BD\n`);
    
    // 4. Actualizar productos con sus imágenes
    console.log('🔄 Actualizando productos con imágenes...\n');
    
    let actualizados = 0;
    let noEncontrados = 0;
    let errores = 0;
    const productosNoEncontrados: string[] = [];
    
    for (const [codiArti, imagePaths] of imagesByCodiArti.entries()) {
      const producto = productosMap.get(codiArti);
      
      if (!producto) {
        noEncontrados++;
        productosNoEncontrados.push(codiArti);
        continue;
      }
      
      try {
        // La primera imagen es la principal
        const imgPrincipal = imagePaths[0];
        
        // Las demás van en el array imagenes
        const imagenesAdicionales = imagePaths.slice(1);
        
        // Preparar datos de actualización
        const updateData: {
          img_principal: string;
          imagenes?: string[];
        } = {
          img_principal: imgPrincipal,
        };
        
        // Solo agregar imagenes si hay adicionales
        if (imagenesAdicionales.length > 0) {
          updateData.imagenes = imagenesAdicionales;
        }
        
        // Actualizar producto
        await prisma.productos.update({
          where: { id_prod: producto.id_prod },
          data: updateData,
        });
        
        actualizados++;
        
        if (actualizados % 50 === 0) {
          console.log(`  Procesados: ${actualizados} productos...`);
        }
      } catch (error) {
        errores++;
        console.error(`  ❌ Error actualizando producto ${codiArti}:`, error);
      }
    }
    
    console.log('\n📊 Resumen:');
    console.log(`  ✓ Productos actualizados: ${actualizados}`);
    console.log(`  ⚠️  Productos no encontrados en BD: ${noEncontrados}`);
    console.log(`  ❌ Errores: ${errores}`);
    
    if (productosNoEncontrados.length > 0 && productosNoEncontrados.length <= 20) {
      console.log('\n⚠️  Códigos de artículo con imágenes pero sin producto en BD:');
      productosNoEncontrados.forEach(codi => {
        console.log(`    - ${codi}`);
      });
    } else if (productosNoEncontrados.length > 20) {
      console.log(`\n⚠️  ${productosNoEncontrados.length} códigos de artículo tienen imágenes pero no productos en BD`);
      console.log('    (Mostrando primeros 20)');
      productosNoEncontrados.slice(0, 20).forEach(codi => {
        console.log(`    - ${codi}`);
      });
    }
    
    // 5. Estadísticas adicionales
    const productosConImagenes = await prisma.productos.count({
      where: {
        img_principal: {
          not: null,
        },
      },
    });
    
    console.log(`\n📈 Estadísticas finales:`);
    console.log(`  - Productos con imagen principal: ${productosConImagenes}`);
    console.log(`  - Total de productos en BD: ${productos.length}`);
    
    console.log('\n✅ Proceso completado exitosamente!');
    
  } catch (error) {
    console.error('\n❌ Error en el proceso:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar
if (require.main === module) {
  enlazarImagenes()
    .then(() => {
      console.log('\nProceso finalizado');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Error fatal:', error);
      process.exit(1);
    });
}

export { enlazarImagenes };

