/**
 * Script para importar datos desde CSV a PostgreSQL usando Prisma
 * Importa: Categorías, Marcas, Grupos, Impuestos y Productos con Stock
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// Directorio base donde están los CSV
const CSV_DIR = path.join(__dirname, '../../../data/csv');

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
  return campo.trim().replace(/"/g, '');
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

function parsearFecha(fecha: string | undefined): Date | null {
  if (!fecha || fecha.trim() === '') return null;
  try {
    // Formato DD/MM/YYYY
    const partes = fecha.trim().split('/');
    if (partes.length === 3) {
      const dia = parseInt(partes[0]);
      const mes = parseInt(partes[1]) - 1;
      const año = parseInt(partes[2]);
      return new Date(año, mes, dia);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Importa Categorías desde maescate.csv
 * Retorna Set con los códigos de categorías válidos
 */
async function importarCategorias(): Promise<Set<string>> {
  console.log('📦 Importando categorías...');
  const categoriasSet = new Set<string>();

  try {
    const contenido = fs.readFileSync(path.join(CSV_DIR, 'maescate.csv'), 'utf-8');
    const registros = parsearCSV(contenido);

    // Saltar header
    for (let i = 1; i < registros.length; i++) {
      const row = registros[i];
      if (!row || row.length < 3) continue;

      const codiCategoria = limpiarCampo(row[1]); // CODICATE
      const nombre = limpiarCampo(row[2]); // DESCCATE

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
    console.error('Error leyendo maescate.csv:', error);
    return categoriasSet;
  }
}

/**
 * Importa Marcas desde TABLMARC.csv
 * Retorna Set con los códigos de marcas válidos
 */
async function importarMarcas(): Promise<Set<string>> {
  console.log('📦 Importando marcas...');
  const marcasSet = new Set<string>();

  try {
    const contenido = fs.readFileSync(path.join(CSV_DIR, 'TABLMARC.csv'), 'utf-8');
    const registros = parsearCSV(contenido);

    // Saltar header
    for (let i = 1; i < registros.length; i++) {
      const row = registros[i];
      if (!row || row.length < 3) continue;

      const codiMarca = limpiarCampo(row[1]); // CODIMARC
      const nombre = limpiarCampo(row[2]); // DESCMARC

      if (!codiMarca) continue;

      try {
        await prisma.marca.upsert({
          where: { codi_marca: codiMarca },
          update: {
            nombre: nombre || null,
            actualizado_en: new Date(),
          },
          create: {
            codi_marca: codiMarca,
            nombre: nombre || null,
            activo: true,
          },
        });

        marcasSet.add(codiMarca);
      } catch (error) {
        console.error(`Error importando marca ${codiMarca}:`, error);
      }
    }

    console.log(`✓ Marcas importadas: ${marcasSet.size}`);
    return marcasSet;
  } catch (error) {
    console.error('Error leyendo TABLMARC.csv:', error);
    return marcasSet;
  }
}

/**
 * Importa Grupos desde MAESGRAR.csv
 * Retorna Set con los códigos de grupos válidos
 */
async function importarGrupos(): Promise<Set<string>> {
  console.log('📦 Importando grupos...');
  const gruposSet = new Set<string>();

  try {
    const contenido = fs.readFileSync(path.join(CSV_DIR, 'MAESGRAR.csv'), 'utf-8');
    const registros = parsearCSV(contenido);

    // Saltar header
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
 * Importa Impuestos desde tablimpu.csv
 * Retorna mapa de códigos a porcentajes
 */
async function importarImpuestos(): Promise<Map<string, number>> {
  console.log('📦 Importando impuestos...');
  const porcentajesMap = new Map<string, number>();

  try {
    const contenido = fs.readFileSync(path.join(CSV_DIR, 'tablimpu.csv'), 'utf-8');
    const registros = parsearCSV(contenido);

    // Saltar header
    for (let i = 1; i < registros.length; i++) {
      const row = registros[i];
      if (!row || row.length < 4) continue;

      const codiImpuesto = limpiarCampo(row[1]); // CODIIMPU
      const nombre = limpiarCampo(row[2]); // DESCIMPU
      const porcentaje = parsearNumero(row[3]); // PORCIMPU

      if (!codiImpuesto) continue;

      try {
        await prisma.iva.upsert({
          where: { codi_impuesto: codiImpuesto },
          update: {
            nombre: nombre || null,
            porcentaje: porcentaje !== null ? porcentaje : null,
            actualizado_en: new Date(),
          },
          create: {
            codi_impuesto: codiImpuesto,
            nombre: nombre || null,
            porcentaje: porcentaje !== null ? porcentaje : null,
            activo: true,
          },
        });

        if (porcentaje !== null) {
          porcentajesMap.set(codiImpuesto, porcentaje);
        }
      } catch (error) {
        console.error(`Error importando impuesto ${codiImpuesto}:`, error);
      }
    }

    console.log(`✓ Impuestos importados: ${porcentajesMap.size}`);
    return porcentajesMap;
  } catch (error) {
    console.error('Error leyendo tablimpu.csv:', error);
    return porcentajesMap;
  }
}

/**
 * Carga precios desde maesprec.csv
 */
function cargarPrecios(): Map<string, { precioVenta: number | null; precioCosto: number | null }> {
  console.log('📦 Cargando precios...');
  const preciosMap = new Map<string, { precioVenta: number | null; precioCosto: number | null }>();

  try {
    const contenido = fs.readFileSync(path.join(CSV_DIR, 'maesprec.csv'), 'utf-8');
    const registros = parsearCSV(contenido);

    // Saltar header
    for (let i = 1; i < registros.length; i++) {
      const row = registros[i];
      if (!row || row.length < 6) continue;

      const codiarti = limpiarCampo(row[1]); // GRARARTI
      const codilist = limpiarCampo(row[2]); // CODILIST
      const precio = parsearNumero(row[5]); // ACTUPREC

      if (!codiarti || precio === null) continue;

      const actual = preciosMap.get(codiarti) || { precioVenta: null, precioCosto: null };

      if (codilist === 'V') {
        // Precio de venta
        if (!actual.precioVenta || precio > actual.precioVenta) {
          actual.precioVenta = precio;
        }
      } else if (codilist === 'C') {
        // Precio de costo
        if (!actual.precioCosto || precio > actual.precioCosto) {
          actual.precioCosto = precio;
        }
      }

      preciosMap.set(codiarti, actual);
    }

    console.log(`✓ Precios cargados: ${preciosMap.size}`);
    return preciosMap;
  } catch (error) {
    console.error('Error leyendo maesprec.csv:', error);
    return preciosMap;
  }
}

/**
 * Carga stock desde MAESSTOK.csv
 */
function cargarStock(): Map<string, number | null> {
  console.log('📦 Cargando stock...');
  const stockMap = new Map<string, number | null>();

  try {
    const contenido = fs.readFileSync(path.join(CSV_DIR, 'MAESSTOK.csv'), 'utf-8');
    const registros = parsearCSV(contenido);

    // Saltar header
    for (let i = 1; i < registros.length; i++) {
      const row = registros[i];
      if (!row || row.length < 4) continue;

      const codiarti = limpiarCampo(row[1]); // GRARARTI
      const stock = parsearNumero(row[4]); // ACTUSTOK

      if (!codiarti) continue;

      // Sumar stock de todos los depósitos
      const stockActual = stockMap.get(codiarti) || 0;
      stockMap.set(codiarti, stockActual + (stock || 0));
    }

    console.log(`✓ Stock cargado: ${stockMap.size}`);
    return stockMap;
  } catch (error) {
    console.error('Error leyendo MAESSTOK.csv:', error);
    return stockMap;
  }
}

/**
 * Obtiene índices de columnas del header de MAESARTI
 */
function obtenerIndicesColumnas(headerRow: string[]): Record<string, number> {
  const indices: Record<string, number> = {};
  for (let i = 0; i < headerRow.length; i++) {
    const col = limpiarCampo(headerRow[i]).toUpperCase();
    if (col.includes('CODIARTI')) indices['CODIARTI'] = i;
    else if (col.includes('DESCARTI')) indices['DESCARTI'] = i;
    else if (col.includes('CODIGRAR')) indices['CODIGRAR'] = i;
    else if (col.includes('CODICATE')) indices['CODICATE'] = i;
    else if (col.includes('CODIMARC')) indices['CODIMARC'] = i;
    else if (col.includes('CODIIMP1')) indices['CODIIMP1'] = i;
    else if (col.includes('CODIIMP2')) indices['CODIIMP2'] = i;
    else if (col.includes('CODIIMP3')) indices['CODIIMP3'] = i;
    else if (col.includes('ACTIARTI')) indices['ACTIARTI'] = i;
    else if (col.includes('IMAGARTI')) indices['IMAGARTI'] = i;
    else if (col.includes('UNMEARTI')) indices['UNMEARTI'] = i;
    else if (col.includes('UNENARTI')) indices['UNENARTI'] = i;
    else if (col.includes('PARTARTI')) indices['PARTARTI'] = i;
  }
  return indices;
}

/**
 * Importa Productos desde MAESARTI.csv
 */
async function importarProductos(
  categoriasSet: Set<string>,
  marcasSet: Set<string>,
  gruposSet: Set<string>,
  impuestosPorcentajesMap: Map<string, number>,
  preciosMap: Map<string, { precioVenta: number | null; precioCosto: number | null }>,
  stockMap: Map<string, number | null>
): Promise<void> {
  console.log('📦 Importando productos...');

  try {
    const contenido = fs.readFileSync(path.join(CSV_DIR, 'MAESARTI.csv'), 'utf-8');
    const registros = parsearCSV(contenido);

    const header = registros[0];
    if (!header) throw new Error('No se encontró header en MAESARTI.csv');

    const indices = obtenerIndicesColumnas(header);
    let errores = 0;

    // Primero acumular todos los productos
    const todosLosProductos: any[] = [];

    for (let rowNum = 1; rowNum < registros.length; rowNum++) {
      const row = registros[rowNum];
      if (!row) continue;

      try {
        const codiarti = limpiarCampo(row[indices['CODIARTI'] ?? 1]);
        if (!codiarti) continue;

        const nombre = limpiarCampo(row[indices['DESCARTI'] ?? 3]);
        const codigrar = limpiarCampo(row[indices['CODIGRAR'] ?? 2]);
        const codicate = limpiarCampo(row[indices['CODICATE'] ?? -1] || '');
        const codimarc = limpiarCampo(row[indices['CODIMARC'] ?? -1] || '');
        const codiimp1 = limpiarCampo(row[indices['CODIIMP1'] ?? 7]);
        const codiimp2 = limpiarCampo(row[indices['CODIIMP2'] ?? 8]);
        const codiimp3 = limpiarCampo(row[indices['CODIIMP3'] ?? -1] || '');
        const actiarti = limpiarCampo(row[indices['ACTIARTI'] ?? -1] || '');
        const imagarti = limpiarCampo(row[indices['IMAGARTI'] ?? -1] || '');
        const unmearti = limpiarCampo(row[indices['UNMEARTI'] ?? 4] || '');
        const unenarti = parsearNumero(row[indices['UNENARTI'] ?? 6]);
        const partarti = limpiarCampo(row[indices['PARTARTI'] ?? 35] || '');

        // Obtener códigos de relaciones (validar que existan)
        const codi_grupo = codigrar && gruposSet.has(codigrar) ? codigrar : null;
        const codi_categoria = codicate && categoriasSet.has(codicate) ? codicate : null;
        const codi_marca = codimarc && marcasSet.has(codimarc) ? codimarc : null;
        const codiimpu = codiimp1 || codiimp2 || codiimp3;
        const codi_impuesto = codiimpu ? codiimpu : null;

        // Obtener precios
        const precios = preciosMap.get(codiarti);
        const precioVenta = precios?.precioVenta || null;

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

        // Obtener stock
        const stock = stockMap.get(codiarti) || null;

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
          stock: stock,
          img_principal: imagarti || null,
          activo: actiarti || null,
          estado: actiarti === 'A' ? 1 : 0,
        };

        todosLosProductos.push(producto);
      } catch (error) {
        errores++;
        if (errores <= 10) {
          console.error(`Error procesando fila ${rowNum + 1}:`, error);
        }
        continue;
      }
    }

    // Filtrar duplicados antes de insertar
    console.log('\nFiltrando productos duplicados...');
    const productosUnicos = filtrarDuplicados(todosLosProductos);
    const duplicadosEliminados = todosLosProductos.length - productosUnicos.length;

    if (duplicadosEliminados > 0) {
      console.log(
        `✓ Duplicados eliminados: ${duplicadosEliminados} (mantenidos: ${productosUnicos.length})`
      );
    }

    // Insertar productos únicos en lotes
    console.log('\nInsertando productos en la base de datos...');
    const BATCH_SIZE = 100;
    let procesados = 0;

    for (let i = 0; i < productosUnicos.length; i += BATCH_SIZE) {
      const batch = productosUnicos.slice(i, i + BATCH_SIZE);
      await procesarBatch(batch);
      procesados += batch.length;
      console.log(`  Procesados: ${procesados}/${productosUnicos.length} productos...`);
    }

    console.log(`✓ Productos importados: ${procesados}`);
    if (errores > 0) {
      console.log(`⚠ Errores: ${errores}`);
    }
  } catch (error) {
    console.error('Error importando productos:', error);
    throw error;
  }
}

/**
 * Calcula un score de completitud para un producto
 * Prioriza campos importantes como nombre, precio, relaciones, etc.
 */
function calcularScoreCompletitud(producto: any): number {
  let score = 0;

  // Campos críticos (peso alto)
  if (producto.nombre && producto.nombre.trim()) score += 100;
  if (producto.precio && producto.precio > 0) score += 50;

  // Campos importantes (peso medio)
  if (producto.codi_grupo && producto.codi_grupo.trim()) score += 20;
  if (producto.codi_categoria && producto.codi_categoria.trim()) score += 20;
  if (producto.codi_marca && producto.codi_marca.trim()) score += 20;
  if (producto.codi_impuesto && producto.codi_impuesto.trim()) score += 15;

  // Campos útiles (peso bajo)
  if (producto.codi_barras && producto.codi_barras.trim()) score += 10;
  if (producto.img_principal && producto.img_principal.trim()) score += 10;
  if (producto.unidad_medida && producto.unidad_medida.trim()) score += 5;
  if (producto.unidades_por_producto && producto.unidades_por_producto > 0)
    score += 5;
  if (producto.stock !== null && producto.stock !== undefined) score += 5;

  return score;
}

/**
 * Filtra productos duplicados, manteniendo solo el que tiene más datos completos
 */
function filtrarDuplicados(productos: any[]): any[] {
  const productosMap = new Map<string, any>();
  const duplicadosEncontrados: string[] = [];

  for (const producto of productos) {
    const codiarti = producto.codi_arti;
    const existente = productosMap.get(codiarti);

    if (existente) {
      duplicadosEncontrados.push(codiarti);

      const scoreExistente = calcularScoreCompletitud(existente);
      const scoreNuevo = calcularScoreCompletitud(producto);

      // Mantener el que tiene mayor score
      if (scoreNuevo > scoreExistente) {
        productosMap.set(codiarti, producto);
        console.log(
          `  ⚠ Duplicado ${codiarti}: Reemplazado (score: ${scoreExistente} → ${scoreNuevo})`
        );
      }
    } else {
      productosMap.set(codiarti, producto);
    }
  }

  if (duplicadosEncontrados.length > 0) {
    console.log(
      `\n⚠ Productos duplicados encontrados: ${duplicadosEncontrados.length}`
    );
    console.log(
      `  Códigos: ${duplicadosEncontrados.slice(0, 10).join(', ')}${
        duplicadosEncontrados.length > 10 ? '...' : ''
      }`
    );
  }

  return Array.from(productosMap.values());
}

/**
 * Procesa un lote de productos usando upsert
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
          stock: producto.stock,
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
 * Función principal de importación
 */
async function importarTodo() {
  console.log('🚀 Iniciando importación de datos desde CSV...\n');

  try {
    // 1. Importar tablas de referencia
    const categoriasSet = await importarCategorias();
    const marcasSet = await importarMarcas();
    const gruposSet = await importarGrupos();
    const impuestosPorcentajesMap = await importarImpuestos();

    // 2. Cargar datos auxiliares
    const preciosMap = cargarPrecios();
    const stockMap = cargarStock();

    // 3. Importar productos
    await importarProductos(
      categoriasSet,
      marcasSet,
      gruposSet,
      impuestosPorcentajesMap,
      preciosMap,
      stockMap
    );

    console.log('\n✅ Importación completada exitosamente!');
  } catch (error) {
    console.error('\n❌ Error en la importación:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  importarTodo()
    .then(() => {
      console.log('Proceso finalizado');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Error fatal:', error);
      process.exit(1);
    });
}

export { importarTodo };

