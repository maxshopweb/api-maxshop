/**
 * Script simplificado para importar datos desde CSV a PostgreSQL usando Prisma
 * Solo usa: MAESARTI.csv, MAESCAT.csv, MAESGRAR.csv
 * Usa datos existentes de: marcas, impuestos, precios y stock en la BD
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// Ajustar ruta según tu estructura de proyecto
const CSV_DIR = path.join(__dirname, '../data/csv');

// Verificar que el directorio existe
if (!fs.existsSync(CSV_DIR)) {
  console.error(`❌ Error: No se encuentra el directorio ${CSV_DIR}`);
  console.log('Ruta actual del script:', __dirname);
  console.log('Ruta esperada de CSV:', CSV_DIR);
  process.exit(1);
}

/**
 * Parsea un CSV simple (maneja comillas y comas)
 */
function parsearCSV(contenido: string): string[][] {
  const lineas = contenido.split('\n');
  const registros: string[][] = [];

  for (const linea of lineas) {
    if (!linea.trim()) continue;

    const campos: string[] = [];
    let campoActual = '';
    let dentroComillas = false;

    for (let i = 0; i < linea.length; i++) {
      const char = linea[i];
      const siguienteChar = linea[i + 1];

      if (char === '"') {
        if (dentroComillas && siguienteChar === '"') {
          campoActual += '"';
          i++;
        } else {
          dentroComillas = !dentroComillas;
        }
      } else if (char === ',' && !dentroComillas) {
        campos.push(campoActual);
        campoActual = '';
      } else {
        campoActual += char;
      }
    }

    campos.push(campoActual);
    registros.push(campos);
  }

  return registros;
}

function limpiarCampo(campo: string | undefined): string {
  if (!campo) return '';
  return campo.trim().replace(/^"|"$/g, '');
}

function parsearNumero(numero: string | undefined): number | null {
  if (!numero || numero.trim() === '') return null;
  try {
    const numeroLimpio = numero.trim().replace(',', '.');
    const valor = parseFloat(numeroLimpio);
    return isNaN(valor) ? null : valor;
  } catch {
    return null;
  }
}

/**
 * Importa Categorías desde MAESCAT.csv
 */
async function importarCategorias(): Promise<Set<string>> {
  console.log('📦 Importando categorías...');
  const categoriasSet = new Set<string>();

  try {
    const contenido = fs.readFileSync(path.join(CSV_DIR, 'MAESCAT.csv'), 'utf-8');
    const registros = parsearCSV(contenido);

    // Saltar header (primera línea)
    for (let i = 1; i < registros.length; i++) {
      const row = registros[i];
      if (!row || row.length < 3) continue;

      const codiCategoria = limpiarCampo(row[1]); // CODICATE (columna 1)
      const nombre = limpiarCampo(row[2]); // DESCCATE (columna 2)

      if (!codiCategoria) continue;

      try {
        await prisma.categoria.upsert({
          where: { codi_categoria: codiCategoria },
          update: {
            nombre: nombre || null,
            actualizado_en: new Date(),
          },
          create: {
            codi_categoria: codiCategoria,
            nombre: nombre || null,
            activo: true,
          },
        });

        categoriasSet.add(codiCategoria);
      } catch (error) {
        console.error(`Error importando categoría ${codiCategoria}:`, error);
      }
    }

    console.log(`✓ Categorías importadas: ${categoriasSet.size}`);
    return categoriasSet;
  } catch (error) {
    console.error('Error leyendo MAESCAT.csv:', error);
    return categoriasSet;
  }
}

/**
 * Importa Grupos desde MAESGRAR.csv
 */
async function importarGrupos(): Promise<Set<string>> {
  console.log('📦 Importando grupos...');
  const gruposSet = new Set<string>();

  try {
    const contenido = fs.readFileSync(path.join(CSV_DIR, 'MAESGRAR.csv'), 'utf-8');
    const registros = parsearCSV(contenido);

    for (let i = 1; i < registros.length; i++) {
      const row = registros[i];
      if (!row || row.length < 3) continue;

      const codiGrupo = limpiarCampo(row[1]); // CODIGRAR
      const nombre = limpiarCampo(row[2]); // DESCGRAR

      if (!codiGrupo) continue;

      try {
        await prisma.grupo.upsert({
          where: { codi_grupo: codiGrupo },
          update: {
            nombre: nombre || null,
            actualizado_en: new Date(),
          },
          create: {
            codi_grupo: codiGrupo,
            nombre: nombre || null,
            activo: true,
          },
        });

        gruposSet.add(codiGrupo);
      } catch (error) {
        console.error(`Error importando grupo ${codiGrupo}:`, error);
      }
    }

    console.log(`✓ Grupos importados: ${gruposSet.size}`);
    return gruposSet;
  } catch (error) {
    console.error('Error leyendo MAESGRAR.csv:', error);
    return gruposSet;
  }
}

/**
 * Carga marcas existentes de la BD
 */
async function cargarMarcasExistentes(): Promise<Set<string>> {
  console.log('📦 Cargando marcas existentes de la BD...');
  const marcasSet = new Set<string>();

  try {
    const marcas = await prisma.marca.findMany({
      select: { codi_marca: true },
    });

    marcas.forEach((marca) => {
      if (marca.codi_marca) {
        marcasSet.add(marca.codi_marca);
      }
    });

    console.log(`✓ Marcas cargadas: ${marcasSet.size}`);
    return marcasSet;
  } catch (error) {
    console.error('Error cargando marcas:', error);
    return marcasSet;
  }
}

/**
 * Carga impuestos existentes de la BD y sus porcentajes
 */
async function cargarImpuestosExistentes(): Promise<Map<string, number>> {
  console.log('📦 Cargando impuestos existentes de la BD...');
  const porcentajesMap = new Map<string, number>();

  try {
    const impuestos = await prisma.iva.findMany({
      select: { 
        codi_impuesto: true,
        porcentaje: true 
      },
    });

    impuestos.forEach((imp) => {
      if (imp.codi_impuesto && imp.porcentaje) {
        porcentajesMap.set(imp.codi_impuesto, Number(imp.porcentaje));
      }
    });

    console.log(`✓ Impuestos cargados: ${porcentajesMap.size}`);
    return porcentajesMap;
  } catch (error) {
    console.error('Error cargando impuestos:', error);
    return porcentajesMap;
  }
}

/**
 * Crea marca automáticamente si no existe
 */
async function crearMarcaSiNoExiste(codiMarca: string, marcasSet: Set<string>): Promise<void> {
  if (!codiMarca || marcasSet.has(codiMarca)) return;

  try {
    await prisma.marca.upsert({
      where: { codi_marca: codiMarca },
      update: {},
      create: {
        codi_marca: codiMarca,
        nombre: `Marca ${codiMarca}`,
        activo: true,
      },
    });

    marcasSet.add(codiMarca);
    console.log(`  ℹ️  Marca creada automáticamente: ${codiMarca}`);
  } catch (error) {
    console.error(`Error creando marca ${codiMarca}:`, error);
  }
}

/**
 * Importa Productos desde MAESARTI.csv
 * Usa datos existentes de marcas e impuestos de la BD
 */
async function importarProductos(
  categoriasSet: Set<string>,
  marcasSet: Set<string>,
  gruposSet: Set<string>,
  impuestosPorcentajesMap: Map<string, number>
): Promise<void> {
  console.log('📦 Importando productos...');

  try {
    const contenido = fs.readFileSync(path.join(CSV_DIR, 'MAESARTI.csv'), 'utf-8');
    const registros = parsearCSV(contenido);

    if (registros.length < 2) {
      console.error('El archivo MAESARTI.csv está vacío o no tiene datos');
      return;
    }

    // MAPEO CORRECTO DE COLUMNAS SEGÚN LA ESTRUCTURA DBF
    const COLUMNAS = {
      ORDEARTI: 0,   // N,6,0
      CODIARTI: 1,   // C,10
      CODIGRAR: 2,   // C,4
      DESCARTI: 3,   // C,70
      UNMEARTI: 4,   // C,3
      ENVAARTI: 5,   // C,5
      UNENARTI: 6,   // N,5,0
      CODIIMP1: 7,   // C,2
      CODIIMP2: 8,   // C,2
      CODIDECA: 9,   // C,2
      CODIDEOP: 10,  // C,2
      ISTKARTI: 11,  // C,1
      IMOVARTI: 12,  // C,1
      CODIESPE: 13,  // C,2
      DECAARTI: 14,  // N,5,2
      REFIARTI: 15,  // N,6,2
      FLETARTI: 16,  // N,6,2
      MARGARTI: 17,  // N,6,2
      COEFARTI: 18,  // N,8,4
      POR1DEOP: 19,  // N,5,2
      POR2DEOP: 20,  // N,5,2
      POR3DEOP: 21,  // N,5,2
      POR4DEOP: 22,  // N,5,2
      POR5DEOP: 23,  // N,5,2
      POR6DEOP: 24,  // N,5,2
      POR7DEOP: 25,  // N,5,2
      CODIPROV: 26,  // C,3
      NUMEMODE: 27,  // C,10
      NPROARTI: 28,  // C,15
      CODIIMP3: 29,  // C,2
      FRANARTI: 30,  // C,1
      PREFARTI: 31,  // C,4
      BASIARTI: 32,  // C,8
      SUF1ARTI: 33,  // C,2
      SUF2ARTI: 34,  // C,3
      PARTARTI: 35,  // C,22
      BAINARTI: 36,  // C,8
      TIPOARTI: 37,  // C,1
      RECAARTI: 38,  // N,8,2
      COMIARTI: 39,  // N,5,2
      NUMECUEN: 40,  // C,6
      ACTIARTI: 41,  // C,1
      PROVARTI: 42,  // C,5
      FEACARTI: 43,  // D
      OBSOARTI: 44,  // C,1
      COB1ARTI: 45,  // C,30
      COB2ARTI: 46,  // C,30
      COBAARTI: 47,  // C,30
      EMERARTI: 48,  // C,40
      HORAARTI: 49,  // C,6
      ULMOARTI: 50,  // D
      CODIMARC: 51,  // C,3
      FEBAARTI: 52,  // D
      SIREARTI: 53,  // C,1
      REEMARTI: 54,  // C,21
      NUMELIST: 55,  // C,2
      CLASARTI: 56,  // C,3
      GRUPARTI: 57,  // C,1
      INDIARTI: 58,  // L
      CODIDESE: 59,  // C,4
      PRECARTI: 60,  // N,15,2
      COPRARTI: 61,  // C,20
      FEALARTI: 62,  // D
      CODIDESC: 63,  // C,2
      MODEARTI: 64,  // C,12
      MARCARTI: 65,  // C,10
      ORIGARTI: 66,  // C,10
      DESPARTI: 67,  // C,20
      FEDEARTI: 68,  // D
      COPRATI: 69,   // C,10
      CODICATE: 70,  // C,4
      IMAGARTI: 71,  // C,120
      LOTEARTI: 72   // C,1
    };

    const productosUnicos = new Map<string, any>();
    let totalProcesados = 0;
    let errores = 0;
    let marcasCreadas = 0;

    // Procesar cada línea (saltar header)
    for (let rowNum = 1; rowNum < registros.length; rowNum++) {
      const row = registros[rowNum];
      if (!row || row.length < 10) continue;

      try {
        // Extraer campos usando el mapeo correcto
        const codiarti = limpiarCampo(row[COLUMNAS.CODIARTI]);
        if (!codiarti) continue;

        const nombre = limpiarCampo(row[COLUMNAS.DESCARTI]);
        const codigrar = limpiarCampo(row[COLUMNAS.CODIGRAR]);
        const codicate = limpiarCampo(row[COLUMNAS.CODICATE]);
        const codimarc = limpiarCampo(row[COLUMNAS.CODIMARC]);
        const codiimp1 = limpiarCampo(row[COLUMNAS.CODIIMP1]);
        const codiimp2 = limpiarCampo(row[COLUMNAS.CODIIMP2]);
        const codiimp3 = limpiarCampo(row[COLUMNAS.CODIIMP3]);
        const actiarti = limpiarCampo(row[COLUMNAS.ACTIARTI]);
        const imagarti = limpiarCampo(row[COLUMNAS.IMAGARTI]);
        const unmearti = limpiarCampo(row[COLUMNAS.UNMEARTI]);
        const unenarti = parsearNumero(row[COLUMNAS.UNENARTI]);
        const partarti = limpiarCampo(row[COLUMNAS.PARTARTI]);
        const precarti = parsearNumero(row[COLUMNAS.PRECARTI]); // Precio desde CSV

        // Crear marca si no existe
        if (codimarc && !marcasSet.has(codimarc)) {
          await crearMarcaSiNoExiste(codimarc, marcasSet);
          marcasCreadas++;
        }

        // Validar y asignar relaciones
        const codi_grupo = codigrar && gruposSet.has(codigrar) ? codigrar : null;
        const codi_categoria = codicate && categoriasSet.has(codicate) ? codicate : null;
        const codi_marca = codimarc && marcasSet.has(codimarc) ? codimarc : null;
        
        // Priorizar impuestos en orden: CODIIMP1, CODIIMP2, CODIIMP3
        const codiimpu = codiimp1 || codiimp2 || codiimp3;
        const codi_impuesto = codiimpu ? codiimpu : null;

        // Usar precio del CSV si existe
        const precioVenta = precarti || null;

        // Calcular IVA
        let precioSinIva = null;
        let ivaMonto = null;
        if (precioVenta && codiimpu) {
          const porcentaje = impuestosPorcentajesMap.get(codiimpu);
          if (porcentaje !== undefined && porcentaje > 0) {
            precioSinIva = precioVenta / (1 + porcentaje / 100);
            ivaMonto = precioVenta - precioSinIva;
          }
        }

        const producto = {
          codi_arti: codiarti,
          nombre: nombre || null,
          codi_grupo,
          codi_categoria,
          codi_marca,
          codi_impuesto,
          precio: precioVenta,
          precio_sin_iva: precioSinIva,
          iva_monto: ivaMonto,
          unidad_medida: unmearti || null,
          unidades_por_producto: unenarti,
          codi_barras: partarti || null,
          stock: null, // Se actualizará después si tienes datos de stock
          img_principal: imagarti || null,
          activo: actiarti || 'A',
          estado: actiarti === 'A' ? 1 : 0,
        };

        // Manejar duplicados - guardar solo el más completo
        const existente = productosUnicos.get(codiarti);
        if (existente) {
          const scoreExistente = calcularScore(existente);
          const scoreNuevo = calcularScore(producto);
          
          if (scoreNuevo > scoreExistente) {
            productosUnicos.set(codiarti, producto);
          }
        } else {
          productosUnicos.set(codiarti, producto);
        }

        totalProcesados++;
      } catch (error) {
        errores++;
        if (errores <= 10) {
          console.error(`Error en fila ${rowNum + 1}:`, error);
        }
      }
    }

    // Insertar en base de datos
    console.log(`\n📝 Productos únicos a insertar: ${productosUnicos.size}`);
    console.log(`⚠️  Duplicados eliminados: ${totalProcesados - productosUnicos.size}`);
    if (marcasCreadas > 0) {
      console.log(`ℹ️  Marcas creadas automáticamente: ${marcasCreadas}`);
    }
    
    const productos = Array.from(productosUnicos.values());
    const BATCH_SIZE = 100;
    let procesados = 0;

    for (let i = 0; i < productos.length; i += BATCH_SIZE) {
      const batch = productos.slice(i, i + BATCH_SIZE);
      await procesarBatch(batch);
      procesados += batch.length;
      console.log(`  Insertados: ${procesados}/${productos.length} productos...`);
    }

    console.log(`✓ Productos importados: ${procesados}`);
    if (errores > 0) {
      console.log(`⚠️  Errores encontrados: ${errores}`);
    }
  } catch (error) {
    console.error('Error importando productos:', error);
    throw error;
  }
}

/**
 * Calcula score de completitud
 */
function calcularScore(producto: any): number {
  let score = 0;
  if (producto.nombre?.trim()) score += 100;
  if (producto.precio && producto.precio > 0) score += 50;
  if (producto.codi_grupo?.trim()) score += 20;
  if (producto.codi_categoria?.trim()) score += 20;
  if (producto.codi_marca?.trim()) score += 20;
  if (producto.codi_impuesto?.trim()) score += 15;
  if (producto.codi_barras?.trim()) score += 10;
  if (producto.img_principal?.trim()) score += 10;
  return score;
}

/**
 * Procesa un lote de productos
 */
async function procesarBatch(productosBatch: any[]): Promise<void> {
  for (const producto of productosBatch) {
    try {
      await prisma.productos.upsert({
        where: { codi_arti: producto.codi_arti },
        update: {
          nombre: producto.nombre,
          codi_grupo: producto.codi_grupo,
          codi_categoria: producto.codi_categoria,
          codi_marca: producto.codi_marca,
          codi_impuesto: producto.codi_impuesto,
          precio: producto.precio,
          precio_sin_iva: producto.precio_sin_iva,
          iva_monto: producto.iva_monto,
          unidad_medida: producto.unidad_medida,
          unidades_por_producto: producto.unidades_por_producto,
          codi_barras: producto.codi_barras,
          img_principal: producto.img_principal,
          activo: producto.activo,
          estado: producto.estado,
          actualizado_en: new Date(),
        },
        create: producto,
      });
    } catch (error) {
      console.error(`Error upsert producto ${producto.codi_arti}:`, error);
    }
  }
}

/**
 * Función principal
 */
async function importarTodo() {
  console.log('🚀 Iniciando importación de datos desde CSV...\n');
  console.log('📁 Archivos CSV requeridos:');
  console.log('  ✓ MAESARTI.csv');
  console.log('  ✓ MAESCAT.csv');
  console.log('  ✓ MAESGRAR.csv\n');

  try {
    // 1. Importar tablas de referencia desde CSV
    const categoriasSet = await importarCategorias();
    const gruposSet = await importarGrupos();
    
    // 2. Cargar datos existentes de la BD
    const marcasSet = await cargarMarcasExistentes();
    const impuestosPorcentajesMap = await cargarImpuestosExistentes();

    // 3. Importar productos
    await importarProductos(
      categoriasSet,
      marcasSet,
      gruposSet,
      impuestosPorcentajesMap
    );

    console.log('\n✅ Importación completada exitosamente!');
    console.log('\nℹ️  Notas:');
    console.log('  - Las marcas faltantes se crearon automáticamente');
    console.log('  - Los impuestos se cargaron desde la BD existente');
    console.log('  - El stock se puede actualizar después si tienes MAESSTOK.csv');
  } catch (error) {
    console.error('\n❌ Error en la importación:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar
if (require.main === module) {
  importarTodo()
    .then(() => {
      console.log('\nProceso finalizado');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Error fatal:', error);
      process.exit(1);
    });
}

export { importarTodo };