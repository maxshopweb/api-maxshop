/**
 * Servicio para importar datos desde CSV a PostgreSQL usando Prisma
 * Importa todas las tablas de referencia y productos
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { ImportResult, ImportSummary, ImportDependencies, PrecioData, StockData } from '../../types/sincronizacion.types';

const prisma = new PrismaClient();

export class CSVImporterService {
  /**
   * Parsea un CSV simple (maneja comillas y comas)
   */
  private parsearCSV(contenido: string): string[][] {
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

  private limpiarCampo(campo: string | undefined): string {
    if (!campo) return '';
    return campo.trim().replace(/"/g, '');
  }

  private parsearNumero(numero: string | undefined): number | null {
    if (!numero || numero.trim() === '') return null;
    try {
      // Limpiar comillas y espacios
      let numeroLimpio = numero.trim().replace(/"/g, '').trim();
      if (numeroLimpio === '') return null;
      
      // Reemplazar coma por punto para parseFloat
      numeroLimpio = numeroLimpio.replace(',', '.');
      const valor = parseFloat(numeroLimpio);
      
      if (isNaN(valor)) return null;
      return valor;
    } catch {
      return null;
    }
  }

  private truncarString(valor: string | null | undefined, maxLength: number): string | null {
    if (!valor) return null;
    const limpio = valor.trim();
    if (limpio.length === 0) return null;
    if (limpio.length <= maxLength) return limpio;
    return limpio.substring(0, maxLength);
  }

  /**
   * Importa Categorías desde maescate.csv
   */
  async importarCategorias(csvPath: string): Promise<ImportResult> {
    const inicio = Date.now();
    const resultado: ImportResult = {
      tabla: 'categoria',
      registrosProcesados: 0,
      registrosInsertados: 0,
      registrosActualizados: 0,
      registrosConError: 0,
      errores: [],
      duracionMs: 0,
    };

    try {
      const contenido = fs.readFileSync(csvPath, 'utf-8');
      const registros = this.parsearCSV(contenido);

      for (let i = 1; i < registros.length; i++) {
        const row = registros[i];
        if (!row || row.length < 3) continue;

        try {
          const codiCategoria = this.truncarString(this.limpiarCampo(row[1]), 4); // CODICATE
          const nombre = this.truncarString(this.limpiarCampo(row[2]), 100); // DESCCATE

          if (!codiCategoria) continue;

          const existe = await prisma.categoria.findUnique({
            where: { codi_categoria: codiCategoria },
          });

          if (existe) {
            await prisma.categoria.update({
              where: { codi_categoria: codiCategoria },
              data: {
                nombre: nombre,
                actualizado_en: new Date(),
              },
            });
            resultado.registrosActualizados++;
          } else {
            await prisma.categoria.create({
              data: {
                codi_categoria: codiCategoria,
                nombre: nombre,
                activo: true,
              },
            });
            resultado.registrosInsertados++;
          }

          resultado.registrosProcesados++;
        } catch (error: any) {
          resultado.registrosConError++;
          resultado.errores.push({
            fila: i + 1,
            codigo: this.limpiarCampo(row[1]) || 'DESCONOCIDO',
            error: error?.message || String(error),
          });
        }
      }
    } catch (error: any) {
      resultado.errores.push({
        fila: 0,
        codigo: 'ARCHIVO',
        error: error?.message || String(error),
      });
    }

    resultado.duracionMs = Date.now() - inicio;
    return resultado;
  }

  /**
   * Importa Marcas desde TABLMARC.csv
   */
  async importarMarcas(csvPath: string): Promise<ImportResult> {
    const inicio = Date.now();
    const resultado: ImportResult = {
      tabla: 'marca',
      registrosProcesados: 0,
      registrosInsertados: 0,
      registrosActualizados: 0,
      registrosConError: 0,
      errores: [],
      duracionMs: 0,
    };

    try {
      const contenido = fs.readFileSync(csvPath, 'utf-8');
      const registros = this.parsearCSV(contenido);

      for (let i = 1; i < registros.length; i++) {
        const row = registros[i];
        if (!row || row.length < 3) continue;

        try {
          const codiMarca = this.truncarString(this.limpiarCampo(row[1]), 3); // CODIMARC
          const nombre = this.truncarString(this.limpiarCampo(row[2]), 100); // DESCMARC

          if (!codiMarca) continue;

          const existe = await prisma.marca.findUnique({
            where: { codi_marca: codiMarca },
          });

          if (existe) {
            await prisma.marca.update({
              where: { codi_marca: codiMarca },
              data: {
                nombre: nombre,
                actualizado_en: new Date(),
              },
            });
            resultado.registrosActualizados++;
          } else {
            await prisma.marca.create({
              data: {
                codi_marca: codiMarca,
                nombre: nombre,
                activo: true,
              },
            });
            resultado.registrosInsertados++;
          }

          resultado.registrosProcesados++;
        } catch (error: any) {
          resultado.registrosConError++;
          resultado.errores.push({
            fila: i + 1,
            codigo: this.limpiarCampo(row[1]) || 'DESCONOCIDO',
            error: error?.message || String(error),
          });
        }
      }
    } catch (error: any) {
      resultado.errores.push({
        fila: 0,
        codigo: 'ARCHIVO',
        error: error?.message || String(error),
      });
    }

    resultado.duracionMs = Date.now() - inicio;
    return resultado;
  }

  /**
   * Importa Grupos desde MAESGRAR.csv
   */
  async importarGrupos(csvPath: string): Promise<ImportResult> {
    const inicio = Date.now();
    const resultado: ImportResult = {
      tabla: 'grupo',
      registrosProcesados: 0,
      registrosInsertados: 0,
      registrosActualizados: 0,
      registrosConError: 0,
      errores: [],
      duracionMs: 0,
    };

    try {
      const contenido = fs.readFileSync(csvPath, 'utf-8');
      const registros = this.parsearCSV(contenido);

      for (let i = 1; i < registros.length; i++) {
        const row = registros[i];
        if (!row || row.length < 3) continue;

        try {
          const codiGrupo = this.truncarString(this.limpiarCampo(row[1]), 4); // CODIGRAR
          const nombre = this.truncarString(this.limpiarCampo(row[2]), 100); // DESCGRAR

          if (!codiGrupo) continue;

          const existe = await prisma.grupo.findUnique({
            where: { codi_grupo: codiGrupo },
          });

          if (existe) {
            await prisma.grupo.update({
              where: { codi_grupo: codiGrupo },
              data: {
                nombre: nombre,
                actualizado_en: new Date(),
              },
            });
            resultado.registrosActualizados++;
          } else {
            await prisma.grupo.create({
              data: {
                codi_grupo: codiGrupo,
                nombre: nombre,
                activo: true,
              },
            });
            resultado.registrosInsertados++;
          }

          resultado.registrosProcesados++;
        } catch (error: any) {
          resultado.registrosConError++;
          resultado.errores.push({
            fila: i + 1,
            codigo: this.limpiarCampo(row[1]) || 'DESCONOCIDO',
            error: error?.message || String(error),
          });
        }
      }
    } catch (error: any) {
      resultado.errores.push({
        fila: 0,
        codigo: 'ARCHIVO',
        error: error?.message || String(error),
      });
    }

    resultado.duracionMs = Date.now() - inicio;
    return resultado;
  }

  /**
   * Importa Impuestos desde tablimpu.csv
   */
  async importarImpuestos(csvPath: string): Promise<ImportResult> {
    const inicio = Date.now();
    const resultado: ImportResult = {
      tabla: 'iva',
      registrosProcesados: 0,
      registrosInsertados: 0,
      registrosActualizados: 0,
      registrosConError: 0,
      errores: [],
      duracionMs: 0,
    };

    try {
      const contenido = fs.readFileSync(csvPath, 'utf-8');
      const registros = this.parsearCSV(contenido);

      for (let i = 1; i < registros.length; i++) {
        const row = registros[i];
        if (!row || row.length < 4) continue;

        try {
          const codiImpuesto = this.truncarString(this.limpiarCampo(row[1]), 2); // CODIIMPU
          const nombre = this.truncarString(this.limpiarCampo(row[2]), 100); // DESCIMPU
          const porcentaje = this.parsearNumero(row[3]); // PORCIMPU

          if (!codiImpuesto) continue;

          const existe = await prisma.iva.findUnique({
            where: { codi_impuesto: codiImpuesto },
          });

          if (existe) {
            await prisma.iva.update({
              where: { codi_impuesto: codiImpuesto },
              data: {
                nombre: nombre,
                porcentaje: porcentaje !== null ? porcentaje : null,
                actualizado_en: new Date(),
              },
            });
            resultado.registrosActualizados++;
          } else {
            await prisma.iva.create({
              data: {
                codi_impuesto: codiImpuesto,
                nombre: nombre,
                porcentaje: porcentaje !== null ? porcentaje : null,
                activo: true,
              },
            });
            resultado.registrosInsertados++;
          }

          resultado.registrosProcesados++;
        } catch (error: any) {
          resultado.registrosConError++;
          resultado.errores.push({
            fila: i + 1,
            codigo: this.limpiarCampo(row[1]) || 'DESCONOCIDO',
            error: error?.message || String(error),
          });
        }
      }
    } catch (error: any) {
      resultado.errores.push({
        fila: 0,
        codigo: 'ARCHIVO',
        error: error?.message || String(error),
      });
    }

    resultado.duracionMs = Date.now() - inicio;
    return resultado;
  }

  /**
   * Importa Listas de Precio desde TABLLIST.csv
   */
  async importarListasPrecio(csvPath: string): Promise<ImportResult> {
    const inicio = Date.now();
    const resultado: ImportResult = {
      tabla: 'lista_precio',
      registrosProcesados: 0,
      registrosInsertados: 0,
      registrosActualizados: 0,
      registrosConError: 0,
      errores: [],
      duracionMs: 0,
    };

    try {
      const contenido = fs.readFileSync(csvPath, 'utf-8');
      const registros = this.parsearCSV(contenido);

      for (let i = 1; i < registros.length; i++) {
        const row = registros[i];
        if (!row || row.length < 3) continue;

        try {
          const codiLista = this.truncarString(this.limpiarCampo(row[1]), 1); // CODILIST
          const nombre = this.truncarString(this.limpiarCampo(row[2]), 15); // DESCLIST
          const tipoLista = this.truncarString(this.limpiarCampo(row[3]), 1); // TIPOLIST
          const ventaLista = this.truncarString(this.limpiarCampo(row[4]), 1); // VENTLIST
          const activoCuenta = this.limpiarCampo(row[5])?.toUpperCase() === 'S'; // ACTUCUEN (L)
          const codiFormaPago = this.truncarString(this.limpiarCampo(row[6]), 1); // CODIFOPA
          const activoLista = this.truncarString(this.limpiarCampo(row[7]), 1); // ACTULIST
          const porcDescuento = this.parsearNumero(row[8]); // PORCDESC
          const porcDescuentoM = this.parsearNumero(row[9]); // PORCDESC_M
          const valorLista = this.parsearNumero(row[10]); // VALOLIST

          if (!codiLista) continue;

          const existe = await prisma.lista_precio.findUnique({
            where: { codi_lista: codiLista },
          });

          const data = {
            nombre: nombre,
            tipo_lista: tipoLista,
            venta_lista: ventaLista,
            activo_cuenta: activoCuenta,
            codi_forma_pago: codiFormaPago,
            activo_lista: activoLista,
            porc_descuento: porcDescuento,
            porc_descuento_m: porcDescuentoM,
            valor_lista: valorLista,
            actualizado_en: new Date(),
          };

          if (existe) {
            await prisma.lista_precio.update({
              where: { codi_lista: codiLista },
              data,
            });
            resultado.registrosActualizados++;
          } else {
            await prisma.lista_precio.create({
              data: {
                codi_lista: codiLista,
                ...data,
                activo: true,
              },
            });
            resultado.registrosInsertados++;
          }

          resultado.registrosProcesados++;
        } catch (error: any) {
          resultado.registrosConError++;
          resultado.errores.push({
            fila: i + 1,
            codigo: this.limpiarCampo(row[1]) || 'DESCONOCIDO',
            error: error?.message || String(error),
          });
        }
      }
    } catch (error: any) {
      resultado.errores.push({
        fila: 0,
        codigo: 'ARCHIVO',
        error: error?.message || String(error),
      });
    }

    resultado.duracionMs = Date.now() - inicio;
    return resultado;
  }

  /**
   * Importa Situaciones Fiscales desde TABLSIFI.csv
   */
  async importarSituacionesFiscales(csvPath: string): Promise<ImportResult> {
    const inicio = Date.now();
    const resultado: ImportResult = {
      tabla: 'situacion_fiscal',
      registrosProcesados: 0,
      registrosInsertados: 0,
      registrosActualizados: 0,
      registrosConError: 0,
      errores: [],
      duracionMs: 0,
    };

    try {
      const contenido = fs.readFileSync(csvPath, 'utf-8');
      const registros = this.parsearCSV(contenido);

      for (let i = 1; i < registros.length; i++) {
        const row = registros[i];
        if (!row || row.length < 3) continue;

        try {
          const codiSifi = this.truncarString(this.limpiarCampo(row[1]), 2); // CODISIFI
          const nombre = this.truncarString(this.limpiarCampo(row[2]), 25); // DESCSIFI
          const sim1Sifi = this.parsearNumero(row[3]); // SIM1SIFI
          const cuentaVenta = this.truncarString(this.limpiarCampo(row[4]), 6); // CUE1SIFI
          const cuentaCompra = this.truncarString(this.limpiarCampo(row[5]), 6); // CUC1SIFI
          const idisSifi = this.truncarString(this.limpiarCampo(row[6]), 1); // IDISSIFI
          const idicSifi = this.truncarString(this.limpiarCampo(row[7]), 1); // IDICSIFI
          const minimoSifi = this.parsearNumero(row[8]); // MINISIFI
          const prbiSifi = this.parsearNumero(row[9]); // PRBISIFI
          const prseSifi = this.parsearNumero(row[10]); // PRSESIFI
          const codiSucursal = this.truncarString(this.limpiarCampo(row[11]), 4); // CODISUCU
          const codiImpuesto = this.truncarString(this.limpiarCampo(row[12]), 2); // CODIIMPU
          const menosImpuesto = this.truncarString(this.limpiarCampo(row[13]), 1); // MOINSIFI

          if (!codiSifi) continue;

          const existe = await prisma.situacion_fiscal.findUnique({
            where: { codi_sifi: codiSifi },
          });

          const data = {
            nombre: nombre,
            sim1_sifi: sim1Sifi,
            cuenta_venta: cuentaVenta,
            cuenta_compra: cuentaCompra,
            idis_sifi: idisSifi,
            idic_sifi: idicSifi,
            minimo_sifi: minimoSifi,
            prbi_sifi: prbiSifi,
            prse_sifi: prseSifi,
            codi_sucursal: codiSucursal,
            codi_impuesto: codiImpuesto,
            menos_impuesto: menosImpuesto,
            actualizado_en: new Date(),
          };

          if (existe) {
            await prisma.situacion_fiscal.update({
              where: { codi_sifi: codiSifi },
              data,
            });
            resultado.registrosActualizados++;
          } else {
            await prisma.situacion_fiscal.create({
              data: {
                codi_sifi: codiSifi,
                ...data,
                activo: true,
              },
            });
            resultado.registrosInsertados++;
          }

          resultado.registrosProcesados++;
        } catch (error: any) {
          resultado.registrosConError++;
          resultado.errores.push({
            fila: i + 1,
            codigo: this.limpiarCampo(row[1]) || 'DESCONOCIDO',
            error: error?.message || String(error),
          });
        }
      }
    } catch (error: any) {
      resultado.errores.push({
        fila: 0,
        codigo: 'ARCHIVO',
        error: error?.message || String(error),
      });
    }

    resultado.duracionMs = Date.now() - inicio;
    return resultado;
  }

  /**
   * Importa Provincias desde TABLPCIA.csv
   */
  async importarProvincias(csvPath: string): Promise<ImportResult> {
    const inicio = Date.now();
    const resultado: ImportResult = {
      tabla: 'provincia',
      registrosProcesados: 0,
      registrosInsertados: 0,
      registrosActualizados: 0,
      registrosConError: 0,
      errores: [],
      duracionMs: 0,
    };

    try {
      const contenido = fs.readFileSync(csvPath, 'utf-8');
      const registros = this.parsearCSV(contenido);

      for (let i = 1; i < registros.length; i++) {
        const row = registros[i];
        if (!row || row.length < 3) continue;

        try {
          const codiProvincia = this.truncarString(this.limpiarCampo(row[1]), 1); // CODIPCIA
          const nombre = this.truncarString(this.limpiarCampo(row[2]), 20); // DESCPCIA
          const alicuota1 = this.parsearNumero(row[3]); // ALI1PCIA
          const alicuota2 = this.parsearNumero(row[4]); // ALI2PCIA
          const alicuota3 = this.parsearNumero(row[5]); // ALI3PCIA
          const alicuota4 = this.parsearNumero(row[6]); // ALI4PCIA

          if (!codiProvincia) continue;

          const existe = await prisma.provincia.findUnique({
            where: { codi_provincia: codiProvincia },
          });

          const data = {
            nombre: nombre,
            alicuota_1: alicuota1,
            alicuota_2: alicuota2,
            alicuota_3: alicuota3,
            alicuota_4: alicuota4,
            actualizado_en: new Date(),
          };

          if (existe) {
            await prisma.provincia.update({
              where: { codi_provincia: codiProvincia },
              data,
            });
            resultado.registrosActualizados++;
          } else {
            await prisma.provincia.create({
              data: {
                codi_provincia: codiProvincia,
                ...data,
                activo: true,
              },
            });
            resultado.registrosInsertados++;
          }

          resultado.registrosProcesados++;
        } catch (error: any) {
          resultado.registrosConError++;
          resultado.errores.push({
            fila: i + 1,
            codigo: this.limpiarCampo(row[1]) || 'DESCONOCIDO',
            error: error?.message || String(error),
          });
        }
      }
    } catch (error: any) {
      resultado.errores.push({
        fila: 0,
        codigo: 'ARCHIVO',
        error: error?.message || String(error),
      });
    }

    resultado.duracionMs = Date.now() - inicio;
    return resultado;
  }

  /**
   * Importa Plataformas de Pago desde tablplat.csv
   */
  async importarPlataformasPago(csvPath: string): Promise<ImportResult> {
    const inicio = Date.now();
    const resultado: ImportResult = {
      tabla: 'plataforma_pago',
      registrosProcesados: 0,
      registrosInsertados: 0,
      registrosActualizados: 0,
      registrosConError: 0,
      errores: [],
      duracionMs: 0,
    };

    try {
      const contenido = fs.readFileSync(csvPath, 'utf-8');
      const registros = this.parsearCSV(contenido);

      for (let i = 1; i < registros.length; i++) {
        const row = registros[i];
        if (!row || row.length < 3) continue;

        try {
          const codiPlataforma = this.truncarString(this.limpiarCampo(row[1]), 2); // CODIPLAT
          const nombre = this.truncarString(this.limpiarCampo(row[2]), 30); // DESCPLAT
          const tipoPlataforma = this.truncarString(this.limpiarCampo(row[3]), 1); // TIPOPLAT

          if (!codiPlataforma) continue;

          const existe = await prisma.plataforma_pago.findUnique({
            where: { codi_plataforma: codiPlataforma },
          });

          const data = {
            nombre: nombre,
            tipo_plataforma: tipoPlataforma,
            actualizado_en: new Date(),
          };

          if (existe) {
            await prisma.plataforma_pago.update({
              where: { codi_plataforma: codiPlataforma },
              data,
            });
            resultado.registrosActualizados++;
          } else {
            await prisma.plataforma_pago.create({
              data: {
                codi_plataforma: codiPlataforma,
                ...data,
                activo: true,
              },
            });
            resultado.registrosInsertados++;
          }

          resultado.registrosProcesados++;
        } catch (error: any) {
          resultado.registrosConError++;
          resultado.errores.push({
            fila: i + 1,
            codigo: this.limpiarCampo(row[1]) || 'DESCONOCIDO',
            error: error?.message || String(error),
          });
        }
      }
    } catch (error: any) {
      resultado.errores.push({
        fila: 0,
        codigo: 'ARCHIVO',
        error: error?.message || String(error),
      });
    }

    resultado.duracionMs = Date.now() - inicio;
    return resultado;
  }

  /**
   * Importa Formas de Pago desde TABLFOPA.csv
   */
  async importarFormasPago(csvPath: string): Promise<ImportResult> {
    const inicio = Date.now();
    const resultado: ImportResult = {
      tabla: 'forma_pago',
      registrosProcesados: 0,
      registrosInsertados: 0,
      registrosActualizados: 0,
      registrosConError: 0,
      errores: [],
      duracionMs: 0,
    };

    try {
      const contenido = fs.readFileSync(csvPath, 'utf-8');
      const registros = this.parsearCSV(contenido);

      for (let i = 1; i < registros.length; i++) {
        const row = registros[i];
        if (!row || row.length < 3) continue;

        try {
          const codiFormaPago = this.truncarString(this.limpiarCampo(row[1]), 1); // CODIFOPA
          const nombre = this.truncarString(this.limpiarCampo(row[2]), 20); // DESCFOPA
          const cuentaVenta = this.truncarString(this.limpiarCampo(row[3]), 6); // CUVEFOPA
          const cuentaCompra = this.truncarString(this.limpiarCampo(row[4]), 6); // CUCOFOPA
          const icoBanco = this.truncarString(this.limpiarCampo(row[5]), 1); // ICOBFOPA
          const ipagFopa = this.truncarString(this.limpiarCampo(row[6]), 1); // IPAGFOPA
          const ivenFopa = this.truncarString(this.limpiarCampo(row[7]), 1); // IVENFOPA
          const ibanFopa = this.truncarString(this.limpiarCampo(row[8]), 1); // IBANFOPA
          const icajFopa = this.truncarString(this.limpiarCampo(row[9]), 1); // ICAJFOPA
          const iuniFopa = this.truncarString(this.limpiarCampo(row[10]), 1); // IUNIFOPA
          const icomFopa = this.truncarString(this.limpiarCampo(row[11]), 1); // ICOMFOPA
          const idisFopa = this.truncarString(this.limpiarCampo(row[12]), 1); // IDISFOPA
          const cajaFopa = this.truncarString(this.limpiarCampo(row[13]), 1); // CAJAFOPA
          const debeFopa = this.parsearNumero(row[14]); // AUDEFOPA
          const haberFopa = this.parsearNumero(row[15]); // AUCRFOPA
          const codiDescuento = this.truncarString(this.limpiarCampo(row[16]), 2); // CODIDEOP
          const imodDescuento = this.truncarString(this.limpiarCampo(row[17]), 1); // IMODDEOP
          const itarFopa = this.truncarString(this.limpiarCampo(row[18]), 1); // ITARFOPA
          const porcFopa = this.parsearNumero(row[19]); // PORCFOPA

          if (!codiFormaPago) continue;

          const existe = await prisma.forma_pago.findUnique({
            where: { codi_forma_pago: codiFormaPago },
          });

          const data = {
            nombre: nombre,
            cuenta_venta: cuentaVenta,
            cuenta_compra: cuentaCompra,
            ico_banco: icoBanco,
            ipag_fopa: ipagFopa,
            iven_fopa: ivenFopa,
            iban_fopa: ibanFopa,
            icaj_fopa: icajFopa,
            iuni_fopa: iuniFopa,
            icom_fopa: icomFopa,
            idis_fopa: idisFopa,
            caja_fopa: cajaFopa,
            debe_fopa: debeFopa,
            haber_fopa: haberFopa,
            codi_descuento: codiDescuento,
            imod_descuento: imodDescuento,
            itar_fopa: itarFopa,
            porc_fopa: porcFopa,
            actualizado_en: new Date(),
          };

          if (existe) {
            await prisma.forma_pago.update({
              where: { codi_forma_pago: codiFormaPago },
              data,
            });
            resultado.registrosActualizados++;
          } else {
            await prisma.forma_pago.create({
              data: {
                codi_forma_pago: codiFormaPago,
                ...data,
                activo: true,
              },
            });
            resultado.registrosInsertados++;
          }

          resultado.registrosProcesados++;
        } catch (error: any) {
          resultado.registrosConError++;
          resultado.errores.push({
            fila: i + 1,
            codigo: this.limpiarCampo(row[1]) || 'DESCONOCIDO',
            error: error?.message || String(error),
          });
        }
      }
    } catch (error: any) {
      resultado.errores.push({
        fila: 0,
        codigo: 'ARCHIVO',
        error: error?.message || String(error),
      });
    }

    resultado.duracionMs = Date.now() - inicio;
    return resultado;
  }

  /**
   * Carga precios desde maesprec.csv (en memoria)
   */
  cargarPrecios(csvPath: string): Map<string, PrecioData> {
    const preciosMap = new Map<string, PrecioData>();

    try {
      const contenido = fs.readFileSync(csvPath, 'utf-8');
      const registros = this.parsearCSV(contenido);

      let preciosCargados = 0;
      let preciosIgnorados = 0;
      let preciosCero = 0;
      const primerosCodigos: string[] = [];

      for (let i = 1; i < registros.length; i++) {
        const row = registros[i];
        if (!row || row.length < 6) continue;

        const codiarti = this.limpiarCampo(row[1]).trim(); // GRARARTI (en realidad es CODIARTI)
        const codilist = this.limpiarCampo(row[2]).trim(); // CODILIST
        const precioRaw = row[5]; // ACTUPREC (sin limpiar aún)
        const precio = this.parsearNumero(precioRaw);

        if (!codiarti || codiarti === '') {
          preciosIgnorados++;
          continue;
        }

        // Guardar primeros códigos para debug
        if (primerosCodigos.length < 10) {
          primerosCodigos.push(codiarti);
        }

        // Solo ignorar si precio es null (NO ignorar 0)
        if (precio === null) {
          preciosIgnorados++;
          continue;
        }

        // Si precio es 0, contarlo pero procesarlo igual
        if (precio === 0) {
          preciosCero++;
        }

        const actual = preciosMap.get(codiarti) || {
          precioVenta: null,
          precioEspecial: null,
          precioPvp: null,
          precioCampanya: null,
          precioCosto: null,
        };

        if (codilist === 'V') {
          if (actual.precioVenta === null || precio > actual.precioVenta) {
            actual.precioVenta = precio;
            preciosCargados++;
          }
        } else if (codilist === 'O') {
          if (actual.precioEspecial === null || precio > actual.precioEspecial) {
            actual.precioEspecial = precio;
            preciosCargados++;
          }
        } else if (codilist === 'P') {
          if (actual.precioPvp === null || precio > actual.precioPvp) {
            actual.precioPvp = precio;
            preciosCargados++;
          }
        } else if (codilist === 'Q') {
          if (actual.precioCampanya === null || precio > actual.precioCampanya) {
            actual.precioCampanya = precio;
            preciosCargados++;
          }
        } else if (codilist === 'C') {
          const costoActual = actual.precioCosto ?? null;
          if (costoActual === null || precio > costoActual) {
            actual.precioCosto = precio;
            preciosCargados++;
          }
        }

        preciosMap.set(codiarti, actual);
      }

      console.log(`📊 Precios cargados: ${preciosCargados} registros, ${preciosMap.size} productos únicos`);
      console.log(`   - Precios con valor 0: ${preciosCero}`);
      console.log(`   - Registros ignorados (null/sin código): ${preciosIgnorados}`);
      if (primerosCodigos.length > 0) {
        console.log(`   - Ejemplo códigos: ${primerosCodigos.slice(0, 5).join(', ')}`);
      }
    } catch (error) {
      console.error('Error leyendo maesprec.csv:', error);
    }

    return preciosMap;
  }

  /**
   * Carga stock y stock_min desde MAESSTOK.csv (en memoria).
   * ACTUSTOK = stock actual (se suma por depósito), MINISTOK = stock mínimo (se toma el máx por producto).
   */
  cargarStock(csvPath: string): Map<string, StockData> {
    const stockMap = new Map<string, StockData>();

    try {
      const contenido = fs.readFileSync(csvPath, 'utf-8');
      const registros = this.parsearCSV(contenido);

      let stockCargado = 0;
      let stockIgnorado = 0;
      let stockCero = 0;
      const primerosCodigos: string[] = [];

      for (let i = 1; i < registros.length; i++) {
        const row = registros[i];
        if (!row || row.length < 6) continue;

        const codiarti = this.limpiarCampo(row[1]).trim(); // GRARARTI (CODIARTI)
        const actustok = this.parsearNumero(row[4]); // ACTUSTOK
        const ministok = this.parsearNumero(row[5]); // MINISTOK

        if (!codiarti || codiarti === '') {
          stockIgnorado++;
          continue;
        }

        if (primerosCodigos.length < 10) {
          primerosCodigos.push(codiarti);
        }

        const stockValor = actustok === null ? 0 : actustok;
        const stockMinValor = ministok === null ? 0 : ministok;

        const actual = stockMap.get(codiarti) || { stock: 0, stock_min: 0 };
        actual.stock += stockValor;
        // Por producto: quedarnos con el mayor MINISTOK si hay varios depósitos
        if (stockMinValor > actual.stock_min) {
          actual.stock_min = stockMinValor;
        }
        stockMap.set(codiarti, actual);

        if (stockValor === 0) {
          stockCero++;
        } else {
          stockCargado++;
        }
      }

      console.log(`📦 Stock cargado: ${stockMap.size} productos únicos (ACTUSTOK + MINISTOK)`);
      console.log(`   - Registros con stock > 0: ${stockCargado}`);
      console.log(`   - Registros con stock = 0: ${stockCero}`);
      console.log(`   - Registros ignorados (sin código): ${stockIgnorado}`);
      if (primerosCodigos.length > 0) {
        console.log(`   - Ejemplo códigos: ${primerosCodigos.slice(0, 5).join(', ')}`);
      }
    } catch (error) {
      console.error('Error leyendo MAESSTOK.csv:', error);
    }

    return stockMap;
  }

  /**
   * Obtiene índices de columnas del header de MAESARTI
   */
  private obtenerIndicesColumnas(headerRow: string[]): Record<string, number> {
    const indices: Record<string, number> = {};
    for (let i = 0; i < headerRow.length; i++) {
      const col = this.limpiarCampo(headerRow[i]).toUpperCase();
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
   * Calcula un score de completitud para un producto
   */
  private calcularScoreCompletitud(producto: any): number {
    let score = 0;
    if (producto.nombre && producto.nombre.trim()) score += 100;
    const precioActivo = producto.precio_venta ?? producto.precio_especial ?? producto.precio_pvp ?? producto.precio_campanya;
    if (precioActivo !== null && precioActivo > 0) score += 50;
    if (producto.codi_grupo && producto.codi_grupo.trim()) score += 20;
    if (producto.codi_categoria && producto.codi_categoria.trim()) score += 20;
    if (producto.codi_marca && producto.codi_marca.trim()) score += 20;
    if (producto.codi_impuesto && producto.codi_impuesto.trim()) score += 15;
    if (producto.codi_barras && producto.codi_barras.trim()) score += 10;
    if (producto.img_principal && producto.img_principal.trim()) score += 10;
    return score;
  }

  /**
   * Filtra productos duplicados, manteniendo solo el que tiene más datos completos
   */
  private filtrarDuplicados(productos: any[]): any[] {
    const productosMap = new Map<string, any>();

    for (const producto of productos) {
      const codiarti = producto.codi_arti;
      const existente = productosMap.get(codiarti);

      if (existente) {
        const scoreExistente = this.calcularScoreCompletitud(existente);
        const scoreNuevo = this.calcularScoreCompletitud(producto);

        if (scoreNuevo > scoreExistente) {
          productosMap.set(codiarti, producto);
        }
      } else {
        productosMap.set(codiarti, producto);
      }
    }

    return Array.from(productosMap.values());
  }

  /**
   * Importa Productos desde MAESARTI.csv
   */
  async importarProductos(
    csvPath: string,
    dependencias: ImportDependencies
  ): Promise<ImportResult> {
    const inicio = Date.now();
    const resultado: ImportResult = {
      tabla: 'productos',
      registrosProcesados: 0,
      registrosInsertados: 0,
      registrosActualizados: 0,
      registrosConError: 0,
      errores: [],
      duracionMs: 0,
    };

    try {
      const contenido = fs.readFileSync(csvPath, 'utf-8');
      const registros = this.parsearCSV(contenido);

      const header = registros[0];
      if (!header) throw new Error('No se encontró header en MAESARTI.csv');

      const indices = this.obtenerIndicesColumnas(header);

      if (indices['CODIARTI'] === undefined) {
        throw new Error('No se encontró la columna CODIARTI en MAESARTI.csv');
      }

      // Acumular todos los productos
      const todosLosProductos: any[] = [];

      for (let rowNum = 1; rowNum < registros.length; rowNum++) {
        const row = registros[rowNum];
        if (!row) continue;

        try {
          const codiarti = this.limpiarCampo(row[indices['CODIARTI'] ?? 1]).trim();
          if (!codiarti) continue;

          const nombre = this.truncarString(
            this.limpiarCampo(row[indices['DESCARTI'] ?? 3]),
            255
          );
          const codigrar = this.truncarString(
            this.limpiarCampo(row[indices['CODIGRAR'] ?? 2]),
            4
          );
          const codicate = this.truncarString(
            this.limpiarCampo(row[indices['CODICATE'] ?? -1] || ''),
            4
          );
          const codimarc = this.truncarString(
            this.limpiarCampo(row[indices['CODIMARC'] ?? -1] || ''),
            3
          );
          const codiimp1 = this.truncarString(
            this.limpiarCampo(row[indices['CODIIMP1'] ?? 7]),
            2
          );
          const codiimp2 = this.truncarString(
            this.limpiarCampo(row[indices['CODIIMP2'] ?? 8]),
            2
          );
          const codiimp3 = this.truncarString(
            this.limpiarCampo(row[indices['CODIIMP3'] ?? -1] || ''),
            2
          );
          const actiarti = this.truncarString(
            this.limpiarCampo(row[indices['ACTIARTI'] ?? -1] || ''),
            1
          );
          const imagarti = this.truncarString(
            this.limpiarCampo(row[indices['IMAGARTI'] ?? -1] || ''),
            120
          );
          const unmearti = this.truncarString(
            this.limpiarCampo(row[indices['UNMEARTI'] ?? 4] || ''),
            3
          );
          const unenarti = this.parsearNumero(row[indices['UNENARTI'] ?? 6]);
          const partarti = this.truncarString(
            this.limpiarCampo(row[indices['PARTARTI'] ?? 35] || ''),
            22
          );

          // Validar relaciones
          const codi_grupo =
            codigrar && dependencias.grupos.has(codigrar) ? codigrar : null;
          const codi_categoria =
            codicate && dependencias.categorias.has(codicate) ? codicate : null;
          const codi_marca =
            codimarc && dependencias.marcas.has(codimarc) ? codimarc : null;

          // Buscar código de impuesto válido
          let codiimpu = null;
          if (codiimp1 && dependencias.impuestos.has(codiimp1)) {
            codiimpu = codiimp1;
          } else if (codiimp2 && dependencias.impuestos.has(codiimp2)) {
            codiimpu = codiimp2;
          } else if (codiimp3 && dependencias.impuestos.has(codiimp3)) {
            codiimpu = codiimp3;
          }
          const codi_impuesto = codiimpu;

          // Obtener precios por lista (codiarti limpio)
          const codiartiLimpio = codiarti.trim();
          const precios = dependencias.precios.get(codiartiLimpio);
          const precio_venta = precios?.precioVenta ?? null;
          const precio_especial = precios?.precioEspecial ?? null;
          const precio_pvp = precios?.precioPvp ?? null;
          const precio_campanya = precios?.precioCampanya ?? null;

          if (rowNum <= 100 && !precio_venta && !precio_especial && !precio_pvp && !precio_campanya) {
            console.log(`⚠️ Producto ${codiartiLimpio} NO tiene precios en mapa`);
          }

          // Lista activa solo para productos nuevos (create); en update no se sobrescribe (cron no pisa elección manual)
          const lista_precio_activa = 'V';

          const stockData = dependencias.stock.get(codiartiLimpio);
          let stock = stockData?.stock ?? 0;
          // Para pruebas: si IMPORT_STOCK_OVERRIDE está definido, usar ese valor; cuando tengas el MAESSTOK final, quita la variable y se usará el stock real
          const overrideEnv = process.env.IMPORT_STOCK_OVERRIDE;
          if (overrideEnv !== undefined && overrideEnv !== '') {
            const override = parseInt(overrideEnv, 10);
            if (!isNaN(override) && override >= 0) stock = override;
          }
          const stock_min = stockData?.stock_min != null ? Math.round(stockData.stock_min) : null;

          const codi_arti_truncado = codiarti.substring(0, 10);

          const producto = {
            codi_arti: codi_arti_truncado,
            nombre: nombre,
            codi_grupo,
            codi_categoria,
            codi_marca,
            codi_impuesto,
            precio_venta,
            precio_especial,
            precio_pvp,
            precio_campanya,
            lista_precio_activa,
            unidad_medida: unmearti,
            unidades_por_producto: unenarti,
            codi_barras: partarti,
            stock,
            stock_min,
            img_principal: imagarti,
            activo: actiarti,
            estado: actiarti === 'A' ? 1 : 0,
          };

          todosLosProductos.push(producto);
          resultado.registrosProcesados++;
        } catch (error: any) {
          resultado.registrosConError++;
          const codiarti =
            this.limpiarCampo(row[indices['CODIARTI'] ?? 1]) || 'DESCONOCIDO';
          resultado.errores.push({
            fila: rowNum + 1,
            codigo: codiarti,
            error: error?.message || String(error),
          });
        }
      }

      // Filtrar duplicados
      const productosUnicos = this.filtrarDuplicados(todosLosProductos);

      // Insertar en lotes
      const BATCH_SIZE = 100;
      for (let i = 0; i < productosUnicos.length; i += BATCH_SIZE) {
        const batch = productosUnicos.slice(i, i + BATCH_SIZE);
        await this.procesarBatchProductos(batch);
      }

      resultado.registrosInsertados = productosUnicos.length;
    } catch (error: any) {
      resultado.errores.push({
        fila: 0,
        codigo: 'ARCHIVO',
        error: error?.message || String(error),
      });
    }

    resultado.duracionMs = Date.now() - inicio;
    return resultado;
  }

  /**
   * Procesa un lote de productos usando upsert
   */
  private async procesarBatchProductos(productosBatch: any[]): Promise<void> {
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
            precio_venta: producto.precio_venta,
            precio_especial: producto.precio_especial,
            precio_pvp: producto.precio_pvp,
            precio_campanya: producto.precio_campanya,
            // No actualizar lista_precio_activa: el usuario puede haberla cambiado manualmente; el cron no la pisa
            unidad_medida: producto.unidad_medida,
            unidades_por_producto: producto.unidades_por_producto,
            codi_barras: producto.codi_barras,
            stock: producto.stock,
            stock_min: producto.stock_min,
            img_principal: producto.img_principal,
            activo: producto.activo,
            estado: producto.estado,
            actualizado_en: new Date(),
          },
          create: producto,
        });
      } catch (error: any) {
        console.error(
          `Error upsert producto ${producto.codi_arti}:`,
          error?.message || error
        );
      }
    }
  }

  /**
   * Importa todos los CSV desde un directorio
   */
  async importarTodo(csvDir: string): Promise<ImportSummary> {
    const inicio = new Date();
    const resultados: ImportResult[] = [];

    try {
      // 1. Importar tablas de referencia (en paralelo)
      console.log('📦 Importando tablas de referencia...');
      const [
        categoriasResult,
        marcasResult,
        gruposResult,
        impuestosResult,
        listasResult,
        sifiResult,
        provinciasResult,
        plataformasResult,
        formasPagoResult,
      ] = await Promise.all([
        this.importarCategorias(path.join(csvDir, 'maescate.csv')),
        this.importarMarcas(path.join(csvDir, 'TABLMARC.csv')),
        this.importarGrupos(path.join(csvDir, 'MAESGRAR.csv')),
        this.importarImpuestos(path.join(csvDir, 'tablimpu.csv')),
        this.importarListasPrecio(path.join(csvDir, 'TABLLIST.csv')),
        this.importarSituacionesFiscales(path.join(csvDir, 'TABLSIFI.csv')),
        this.importarProvincias(path.join(csvDir, 'TABLPCIA.csv')),
        this.importarPlataformasPago(path.join(csvDir, 'tablplat.csv')),
        this.importarFormasPago(path.join(csvDir, 'TABLFOPA.csv')),
      ]);

      resultados.push(
        categoriasResult,
        marcasResult,
        gruposResult,
        impuestosResult,
        listasResult,
        sifiResult,
        provinciasResult,
        plataformasResult,
        formasPagoResult
      );

      // 2. Cargar datos auxiliares (en memoria)
      console.log('📦 Cargando datos auxiliares...');
      const preciosMap = this.cargarPrecios(path.join(csvDir, 'maesprec.csv'));
      const stockMap = this.cargarStock(path.join(csvDir, 'MAESSTOK.csv'));
      const overrideEnv = process.env.IMPORT_STOCK_OVERRIDE;
      if (overrideEnv !== undefined && overrideEnv !== '' && !isNaN(parseInt(overrideEnv, 10))) {
        console.log(`⚠️ IMPORT_STOCK_OVERRIDE=${overrideEnv} activo: todos los productos usarán este stock (quita la variable cuando tengas el MAESSTOK final)`);
      }

      // 3. Cargar dependencias para productos
      const categoriasSet = new Set<string>(
        (await prisma.categoria.findMany({ select: { codi_categoria: true } })).map(
          (c: { codi_categoria: string | null }) => c.codi_categoria
        ).filter((x: string | null): x is string => x != null)
      );
      const marcasSet = new Set<string>(
        (await prisma.marca.findMany({ select: { codi_marca: true } })).map(
          (m: { codi_marca: string }) => m.codi_marca
        )
      );
      const gruposSet = new Set<string>(
        (await prisma.grupo.findMany({ select: { codi_grupo: true } })).map(
          (g: { codi_grupo: string }) => g.codi_grupo
        )
      );
      const impuestosMap = new Map<string, number>();
      (
        await prisma.iva.findMany({
          select: { codi_impuesto: true, porcentaje: true },
        })
      ).forEach((imp: any) => {
        if (imp.codi_impuesto && imp.porcentaje) {
          impuestosMap.set(imp.codi_impuesto, Number(imp.porcentaje));
        }
      });

      const dependencias: ImportDependencies = {
        categorias: categoriasSet,
        marcas: marcasSet,
        grupos: gruposSet,
        impuestos: impuestosMap,
        precios: preciosMap,
        stock: stockMap,
      };

      // 4. Importar productos
      console.log('\n📦 Importando productos...');
      console.log(`   Precios disponibles: ${preciosMap.size} productos únicos`);
      console.log(`   Stock disponible: ${stockMap.size} productos únicos`);
      
      // Mostrar ejemplos de códigos para verificar coincidencia
      const ejemplosPrecios = Array.from(preciosMap.keys()).slice(0, 5);
      const ejemplosStock = Array.from(stockMap.keys()).slice(0, 5);
      console.log(`   Ejemplos códigos en precios: ${ejemplosPrecios.join(', ')}`);
      console.log(`   Ejemplos códigos en stock: ${ejemplosStock.join(', ')}`);
      
      const productosResult = await this.importarProductos(
        path.join(csvDir, 'MAESARTI.csv'),
        dependencias
      );
      resultados.push(productosResult);
      
      // Estadísticas finales de productos
      const productosConPrecio = productosResult.registrosProcesados > 0 
        ? await prisma.productos.count({ where: { precio_venta: { not: null } } })
        : 0;
      const productosConPrecioCero = productosResult.registrosProcesados > 0
        ? await prisma.productos.count({ where: { precio_venta: 0 } })
        : 0;
      const productosConStock = productosResult.registrosProcesados > 0
        ? await prisma.productos.count({ where: { stock: { gt: 0 } } })
        : 0;
      const productosConStockCero = productosResult.registrosProcesados > 0
        ? await prisma.productos.count({ where: { stock: 0 } })
        : 0;
      
      console.log('\n📊 Estadísticas finales de productos:');
      console.log(`   - Con precio (no null): ${productosConPrecio}`);
      console.log(`   - Con precio = 0: ${productosConPrecioCero}`);
      console.log(`   - Con stock > 0: ${productosConStock}`);
      console.log(`   - Con stock = 0: ${productosConStockCero}`);

      const fin = new Date();
      const duracionTotalMs = fin.getTime() - inicio.getTime();

      // Calcular estadísticas
      const estadisticas = {
        totalRegistros: resultados.reduce((sum, r) => sum + r.registrosProcesados, 0),
        totalInsertados: resultados.reduce((sum, r) => sum + r.registrosInsertados, 0),
        totalActualizados: resultados.reduce((sum, r) => sum + r.registrosActualizados, 0),
        totalErrores: resultados.reduce((sum, r) => sum + r.registrosConError, 0),
      };

      return {
        inicio,
        fin,
        duracionTotalMs,
        resultados,
        estadisticas,
      };
    } catch (error) {
      throw error;
    }
  }
}

export default new CSVImporterService();
