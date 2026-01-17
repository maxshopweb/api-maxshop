/**
 * Servicio de envíos de Andreani
 * 
 * Este servicio maneja todas las operaciones relacionadas con envíos:
 * - Crear órdenes de envío
 * - Consultar órdenes existentes
 * - Obtener etiquetas
 * - Consultar estado de envíos
 * 
 * REGLA DE NEGOCIO:
 * - La orden de envío se crea únicamente cuando la venta está CONFIRMADA
 * - El estado_pago debe ser 'aprobado' para crear el envío
 */

import { prisma } from '../../index';
import { andreaniApiService } from './andreani.api.service';
import { andreaniConfig, getAndreaniEnvironmentString } from '../../config/andreani.config';
import {
    ICreateOrdenEnvioRequest,
    IOrdenEnvioResponse,
    IDomicilio,
    IDomicilioCompleto,
    IConsultaOrdenResponse,
    IEtiquetaResponse,
    IEstadoEnvioResponse,
    ICotizarEnvioRequest,
    ICotizarEnvioResponse,
    ICotizarEnvioResponseRaw,
    IApiResult,
} from './andreani.types';
import { IVenta } from '../../types';

export class AndreaniEnviosService {
    /**
     * Crea una orden de envío en Andreani
     * 
     * IMPORTANTE: Solo se puede crear si la venta está confirmada (estado_pago = 'aprobado')
     * 
     * @param idVenta - ID de la venta confirmada
     * @param datosEnvio - Datos del envío (opcional, se pueden inferir de la venta)
     * @returns Orden de envío creada
     */
    async crearOrdenEnvio(
        idVenta: number,
        datosEnvio?: Partial<ICreateOrdenEnvioRequest>
    ): Promise<IOrdenEnvioResponse> {
        try {
            // 1. Verificar que la venta existe y está confirmada
            const venta = await prisma.venta.findUnique({
                where: { id_venta: idVenta },
                include: {
                    cliente: {
                        include: {
                            usuarios: true,
                        },
                    },
                    venta_detalle: {
                        include: {
                            productos: true,
                        },
                    },
                },
            });

            if (!venta) {
                throw new Error(`Venta ${idVenta} no encontrada`);
            }

            // 2. Validar que la venta esté confirmada
            console.log(`🔍 [Andreani] Verificando estado de venta #${idVenta}: estado_pago = ${venta.estado_pago}`);
            if (venta.estado_pago !== 'aprobado') {
                throw new Error(
                    `La venta ${idVenta} no está confirmada. ` +
                    `Estado actual: ${venta.estado_pago}. ` +
                    `Solo se pueden crear envíos para ventas con estado_pago = 'aprobado'`
                );
            }
            
            // Validar que la venta tenga cliente y datos necesarios
            if (!venta.cliente) {
                throw new Error(`La venta ${idVenta} no tiene cliente asociado`);
            }
            
            if (!venta.cliente.direccion || !venta.cliente.ciudad || !venta.cliente.provincia) {
                console.warn(`⚠️ [Andreani] Venta #${idVenta} tiene datos de dirección incompletos. Dirección: ${venta.cliente.direccion}, Ciudad: ${venta.cliente.ciudad}, Provincia: ${venta.cliente.provincia}`);
            }

            // 3. Verificar si ya existe un envío para esta venta
            const envioExistente = await prisma.envios.findFirst({
                where: { id_venta: idVenta },
            });

            if (envioExistente && envioExistente.cod_seguimiento) {
                throw new Error(
                    `Ya existe un envío para la venta ${idVenta}. ` +
                    `Código de seguimiento: ${envioExistente.cod_seguimiento}`
                );
            }

            // 4. Preparar datos del envío
            console.log(`🔄 [Andreani] Preparando datos de pre-envío para venta #${idVenta}...`);
            const ordenEnvio = await this.prepararDatosOrdenEnvio(venta, datosEnvio);
            console.log(`✅ [Andreani] Datos de pre-envío preparados. Contrato: ${ordenEnvio.contrato}, ID Pedido: ${ordenEnvio.idPedido}`);

            // 5. Crear pre-envío en Andreani
            console.log(`🔄 [Andreani] Enviando solicitud POST a /v2/ordenes-de-envio...`);
            const result = await andreaniApiService.post<IOrdenEnvioResponse>(
                '/v2/ordenes-de-envio',
                ordenEnvio
            );

            if (!result.success || !result.data) {
                console.error(`❌ [Andreani] Error en respuesta de API:`, result);
                throw new Error(
                    result.error || 'Error al crear pre-envío en Andreani'
                );
            }

            const ordenCreada = result.data;
            
            // Extraer número de envío (tracking) del primer bulto
            const numeroEnvio = ordenCreada.bultos?.[0]?.numeroDeEnvio || null;
            
            console.log(`✅ [Andreani] Pre-envío creado. Estado: ${ordenCreada.estado}, Número de envío: ${numeroEnvio || 'N/A'}`);
            console.log(`📦 [Andreani] Agrupador: ${ordenCreada.agrupadorDeBultos}`);
            console.log(`🏷️ [Andreani] Etiquetas: ${ordenCreada.etiquetasPorAgrupador || 'N/A'}`);

            // 6. Guardar pre-envío en BD
            console.log(`🔄 [Andreani] Guardando pre-envío en base de datos...`);
            const envio = await prisma.envios.create({
                data: {
                    id_venta: idVenta,
                    empresa_envio: 'andreani',
                    cod_seguimiento: numeroEnvio,
                    estado_envio: this.mapearEstadoAndreani(ordenCreada.estado),
                    costo_envio: null, // No viene en la respuesta del pre-envío
                    fecha_envio: new Date(),
                    observaciones: `Pre-envío Andreani. Estado: ${ordenCreada.estado}. Agrupador: ${ordenCreada.agrupadorDeBultos}. Etiquetas: ${ordenCreada.etiquetasPorAgrupador || 'N/A'}`,
                },
            });
            console.log(`✅ [Andreani] Pre-envío guardado en BD. ID: ${envio.id_envio}, Código: ${numeroEnvio || 'N/A'}`);

            // 7. Actualizar venta con id_envio
            console.log(`🔄 [Andreani] Actualizando venta con id_envio...`);
            await prisma.venta.update({
                where: { id_venta: idVenta },
                data: {
                    id_envio: envio.id_envio,
                    estado_envio: this.mapearEstadoAndreani(ordenCreada.estado),
                },
            });
            console.log(`✅ [Andreani] Venta actualizada con id_envio: ${envio.id_envio}`);

            console.log(`✅ [Andreani] Pre-envío creado completamente para venta ${idVenta}`);

            return ordenCreada;
        } catch (error: any) {
            console.error(`❌ [Andreani] Error al crear orden de envío para venta ${idVenta}:`, error.message);
            throw error;
        }
    }

    /**
     * Consulta una orden de envío por número de orden o número de envío
     */
    async consultarOrden(
        numeroOrden?: string,
        numeroEnvio?: string
    ): Promise<IConsultaOrdenResponse> {
        try {
            if (!numeroOrden && !numeroEnvio) {
                throw new Error('Se debe proporcionar numeroOrden o numeroEnvio');
            }

            const identificador = numeroOrden || numeroEnvio;
            const endpoint = `/v2/ordenes-de-envio/${identificador}`;

            const result = await andreaniApiService.get<IConsultaOrdenResponse>(endpoint);

            if (!result.success || !result.data) {
                throw new Error(
                    result.error || 'Error al consultar orden de envío'
                );
            }

            return result.data;
        } catch (error: any) {
            console.error(`❌ [Andreani] Error al consultar orden:`, error.message);
            throw error;
        }
    }

    /**
     * Obtiene la etiqueta de un envío
     */
    async obtenerEtiqueta(numeroEnvio: string): Promise<IEtiquetaResponse> {
        try {
            if (!numeroEnvio) {
                throw new Error('Se debe proporcionar numeroEnvio');
            }

            const endpoint = `/v2/etiquetas?numeroDeEnvio=${numeroEnvio}`;

            const result = await andreaniApiService.get<IEtiquetaResponse>(endpoint);

            if (!result.success || !result.data) {
                throw new Error(
                    result.error || 'Error al obtener etiqueta'
                );
            }

            return result.data;
        } catch (error: any) {
            console.error(`❌ [Andreani] Error al obtener etiqueta:`, error.message);
            throw error;
        }
    }

    /**
     * Consulta el estado de un envío
     * CORREGIDO: Usa el endpoint correcto según documentación: /v2/ordenes-de-envio/{numeroDeEnvio}
     */
    async consultarEstadoEnvio(numeroEnvio: string): Promise<IEstadoEnvioResponse> {
        try {
            if (!numeroEnvio) {
                throw new Error('Se debe proporcionar numeroEnvio');
            }

            // CORREGIDO: Usar el endpoint correcto según documentación
            const endpoint = `/v2/ordenes-de-envio/${numeroEnvio}`;

            const result = await andreaniApiService.get<IConsultaOrdenResponse>(endpoint);

            if (!result.success || !result.data) {
                throw new Error(
                    result.error || 'Error al consultar estado de envío'
                );
            }

            const ordenData = result.data;
            
            // Extraer estado de la respuesta
            const estado = ordenData.estado || 'Desconocido';

            // Actualizar estado en BD si existe el envío
            const envio = await prisma.envios.findFirst({
                where: { cod_seguimiento: numeroEnvio },
            });

            if (envio && estado) {
                await prisma.envios.update({
                    where: { id_envio: envio.id_envio },
                    data: {
                        estado_envio: this.mapearEstadoAndreani(estado),
                    },
                });

                // Actualizar estado en la venta
                if (envio.id_venta) {
                    await prisma.venta.update({
                        where: { id_venta: envio.id_venta },
                        data: {
                            estado_envio: this.mapearEstadoAndreani(estado),
                        },
                    });
                }
            }

            // Convertir IConsultaOrdenResponse a IEstadoEnvioResponse para compatibilidad
            const estadoResponse: IEstadoEnvioResponse = {
                numeroDeEnvio: ordenData.numeroDeEnvio || numeroEnvio,
                numeroDeTracking: ordenData.numeroDeTracking || ordenData.numeroDeEnvio,
                estado: estado,
                fechaActualizacion: ordenData.fechaActualizacion || ordenData.fechaCreacion,
                eventos: ordenData.eventos,
                errores: ordenData.errores,
            };

            return estadoResponse;
        } catch (error: any) {
            console.error(`❌ [Andreani] Error al consultar estado de envío:`, error.message);
            throw error;
        }
    }

    /**
     * Prepara los datos de la orden de envío a partir de la venta
     */
    private async prepararDatosOrdenEnvio(
        venta: any,
        datosAdicionales?: Partial<ICreateOrdenEnvioRequest>
    ): Promise<ICreateOrdenEnvioRequest> {
        // Obtener datos del negocio (remitente)
        // Usar $queryRaw para evitar problemas con planes en caché de PostgreSQL
        const negocio = await prisma.$queryRaw<Array<{
            id_neg: number;
            nombre: string | null;
            direccion: string | null;
            logo: string | null;
            telefono: string | null;
            cuit: string | null;
            cond_iva: string | null;
            email: string | null;
            color_primario: string | null;
            color_secundario: string | null;
            token_pago: string | null;
            token_envio: string | null;
        }>>`SELECT * FROM negocio LIMIT 1`;
        
        const negocioData = negocio && negocio.length > 0 ? negocio[0] : null;
        
        if (!negocioData) {
            throw new Error('No se encontró configuración de negocio');
        }

        // Datos del cliente (destinatario)
        const cliente = venta.cliente;
        const usuario = cliente?.usuarios;

        if (!cliente || !usuario) {
            throw new Error('La venta no tiene cliente asociado');
        }

        // Determinar contrato según destino (domicilio o sucursal)
        const esDomicilio = !datosAdicionales?.destino?.sucursal;
        const contrato = esDomicilio 
            ? (process.env.ANDREANI_CONTRATO_DOM || '400006709')
            : (process.env.ANDREANI_CONTRATO_SUC || '400006711');

        // Preparar origen postal
        const origenPostal: IDomicilioCompleto = {
            codigoPostal: process.env.ANDREANI_ORIGEN_CP || '0000',
            calle: negocioData.direccion?.split(',')[0] || '',
            numero: '0',
            localidad: process.env.ANDREANI_ORIGEN_LOCALIDAD || '',
            region: process.env.ANDREANI_ORIGEN_REGION || '',
            pais: 'AR',
        };

        // Preparar destino postal
        const mapearProvinciaARegion = (provincia: string | null | undefined): string => {
            if (!provincia) return '';
            const prov = provincia.toLowerCase();
            if (prov.includes('córdoba') || prov.includes('cordoba')) return 'CB';
            if (prov.includes('buenos aires') || prov.includes('bs as')) return 'BA';
            if (prov.includes('santa fe')) return 'SF';
            if (prov.includes('mendoza')) return 'MZ';
            return provincia.substring(0, 2).toUpperCase();
        };

        const destinoPostal: IDomicilioCompleto = {
            codigoPostal: cliente.cod_postal?.toString() || datosAdicionales?.destino?.postal?.codigoPostal || '0000',
            calle: cliente.direccion?.split(',')[0] || datosAdicionales?.destino?.postal?.calle || '',
            numero: datosAdicionales?.destino?.postal?.numero || '0',
            localidad: cliente.ciudad || datosAdicionales?.destino?.postal?.localidad || '',
            region: mapearProvinciaARegion(cliente.provincia) || datosAdicionales?.destino?.postal?.region || '',
            pais: 'AR',
        };

        // Preparar remitente
        const remitente = {
            nombreCompleto: negocioData.nombre || 'Negocio',
            email: negocioData.email || '',
            documentoTipo: 'CUIT',
            documentoNumero: negocioData.cuit || '',
            telefonos: negocioData.telefono ? [
                { tipo: 1, numero: negocioData.telefono } // 1 = Fijo
            ] : [],
        };

        // Preparar destinatario
        const destinatario = [
            {
                nombreCompleto: `${usuario.nombre || ''} ${usuario.apellido || ''}`.trim() || 'Cliente',
                email: usuario.email || '',
                documentoTipo: 'DNI',
                documentoNumero: datosAdicionales?.destinatario?.[0]?.documentoNumero || '00000000',
                telefonos: usuario.telefono ? [
                    { tipo: 2, numero: usuario.telefono } // 2 = Móvil
                ] : [],
            }
        ];

        // Calcular bultos
        const bultosCalculados = this.calcularBultos(venta.venta_detalle, venta.id_venta);
        const bultos = bultosCalculados.map((bulto) => ({
            kilos: bulto.kilos,
            largoCm: bulto.largoCm,
            altoCm: bulto.altoCm,
            anchoCm: bulto.anchoCm,
            volumenCm: (bulto.largoCm || 0) * (bulto.altoCm || 0) * (bulto.anchoCm || 0),
            valorDeclaradoSinImpuestos: bulto.valorDeclarado || 0,
            descripcion: bulto.descripcion,
        }));

        // Construir orden de envío para POST (solo lo que se envía)
        const ordenEnvio: ICreateOrdenEnvioRequest = {
            contrato,
            tipoDeServicio: datosAdicionales?.tipoDeServicio,
            sucursalClienteID: datosAdicionales?.sucursalClienteID,
            
            origen: {
                postal: origenPostal,
                ...(datosAdicionales?.origen?.coordenadas && { coordenadas: datosAdicionales.origen.coordenadas }),
            },
            
            destino: {
                postal: destinoPostal,
                ...(datosAdicionales?.destino?.sucursal && { sucursal: datosAdicionales.destino.sucursal }),
                ...(datosAdicionales?.destino?.coordenadas && { coordenadas: datosAdicionales.destino.coordenadas }),
            },
            
            idPedido: `VENTA-${venta.id_venta}`,
            
            remitente,
            destinatario,
            
            bultos,
            
            // Campos opcionales
            ...(datosAdicionales?.remito && { remito: datosAdicionales.remito }),
            centroDeCostos: datosAdicionales?.centroDeCostos,
            productoAEntregar: datosAdicionales?.productoAEntregar,
            productoARetirar: datosAdicionales?.productoARetirar,
            tipoProducto: datosAdicionales?.tipoProducto,
            categoriaFacturacion: datosAdicionales?.categoriaFacturacion,
            pagoDestino: datosAdicionales?.pagoDestino,
            valorACobrar: datosAdicionales?.valorACobrar,
            fechaDeEntrega: datosAdicionales?.fechaDeEntrega,
            codigoVerificadorDeEntrega: datosAdicionales?.codigoVerificadorDeEntrega,
            pagoPendienteEnMostrador: datosAdicionales?.pagoPendienteEnMostrador,
        };

        return ordenEnvio;
    }

    /**
     * Calcula los bultos a partir de los detalles de la venta
     * Retorna estructura base que luego se completa con datos B2C
     */
    private calcularBultos(detalles: any[], idVenta: number): Array<{
        kilos: number;
        largoCm: number;
        altoCm: number;
        anchoCm: number;
        valorDeclarado: number;
        descripcion: string;
    }> {
        // Por ahora, crear un bulto único con peso estimado
        // Se puede mejorar calculando peso real por producto
        const pesoTotal = detalles.reduce((acc, detalle) => {
            return acc + (detalle.cantidad || 1);
        }, 0);

        // Calcular valor declarado desde el total de la venta
        const valorDeclarado = detalles.reduce((acc, detalle) => {
            return acc + ((detalle.precio_unitario || 0) * (detalle.cantidad || 0));
        }, 0);

        return [
            {
                kilos: Math.max(pesoTotal, 1), // Mínimo 1 kg
                altoCm: 10, // Dimensiones por defecto (se pueden mejorar)
                anchoCm: 20,
                largoCm: 30,
                valorDeclarado: Math.max(valorDeclarado, 0),
                descripcion: `Productos de la venta #${idVenta}`,
            },
        ];
    }

    /**
     * Mapea el estado de Andreani al estado interno del sistema
     * Estados de pre-envío: Pendiente, Solicitado, Creada, Rechazado
     */
    private mapearEstadoAndreani(estadoAndreani: string): string {
        const estados: Record<string, string> = {
            // Estados de pre-envío
            'pendiente': 'pendiente',
            'solicitado': 'preparando',
            'solicitada': 'preparando',
            'creada': 'preparando',
            'creado': 'preparando',
            'rechazado': 'cancelado',
            'rechazada': 'cancelado',
            // Estados de envío
            'en_preparacion': 'preparando',
            'enviado': 'enviado',
            'en_transito': 'en_transito',
            'entregado': 'entregado',
            'cancelado': 'cancelado',
        };

        return estados[estadoAndreani.toLowerCase()] || estadoAndreani.toLowerCase();
    }

    /**
     * Cotiza un envío con Andreani
     * GET /v1/tarifas?cpDestino=...&contrato=...&cliente=...
     * 
     * IMPORTANTE: La API de tarifas usa query params (GET), no POST
     * 
     * @param input - Datos para la cotización
     * @returns Respuesta normalizada con precio, plazo y servicio
     */
    async cotizarEnvioAndreani(input: ICotizarEnvioRequest): Promise<ICotizarEnvioResponse> {
        try {
            console.log(`🔄 [Andreani] Cotizando envío...`, {
                contrato: input.contrato,
                cliente: input.cliente,
                cpDestino: input.cpDestino,
            });

            // Validar campos obligatorios
            if (!input.contrato || !input.cliente || !input.cpDestino || !input['bultos[0][volumen]']) {
                throw new Error(
                    'Campos obligatorios: contrato, cliente, cpDestino, bultos[0][volumen]'
                );
            }

            // Construir query params
            const queryParams = new URLSearchParams();
            queryParams.append('cpDestino', input.cpDestino);
            queryParams.append('contrato', input.contrato);
            queryParams.append('cliente', input.cliente);
            
            if (input.sucursalOrigen) {
                queryParams.append('sucursalOrigen', input.sucursalOrigen);
            }
            
            // Bultos
            queryParams.append('bultos[0][volumen]', input['bultos[0][volumen]']);
            if (input['bultos[0][kilos]']) {
                queryParams.append('bultos[0][kilos]', input['bultos[0][kilos]']);
            }
            if (input['bultos[0][valorDeclarado]']) {
                queryParams.append('bultos[0][valorDeclarado]', input['bultos[0][valorDeclarado]']);
            }
            if (input['bultos[0][altoCm]']) {
                queryParams.append('bultos[0][altoCm]', input['bultos[0][altoCm]']);
            }
            if (input['bultos[0][largoCm]']) {
                queryParams.append('bultos[0][largoCm]', input['bultos[0][largoCm]']);
            }
            if (input['bultos[0][anchoCm]']) {
                queryParams.append('bultos[0][anchoCm]', input['bultos[0][anchoCm]']);
            }

            // Llamar a la API de Andreani usando GET con query params
            const endpoint = `${andreaniConfig.endpoints.tarifas}?${queryParams.toString()}`;
            const result = await andreaniApiService.get<ICotizarEnvioResponseRaw>(endpoint);

            if (!result.success || !result.data) {
                console.error(`❌ [Andreani] Error en cotización:`, result.error);
                throw new Error(
                    result.error || 'Error al cotizar envío con Andreani'
                );
            }

            const data = result.data;

            // Validar errores en la respuesta
            if (data.errores && data.errores.length > 0) {
                const errores = data.errores.map(e => e.mensaje || e.codigo).join(', ');
                throw new Error(`Error en cotización de Andreani: ${errores}`);
            }

            // Extraer precio total (con IVA)
            const precio = data.tarifaConIva?.total ? Number(data.tarifaConIva.total) : 0;

            if (precio <= 0) {
                throw new Error('La cotización no devolvió un precio válido');
            }

            // Normalizar respuesta
            const entorno = getAndreaniEnvironmentString();
            const respuestaNormalizada: ICotizarEnvioResponse = {
                proveedor: 'ANDREANI',
                precio: precio,
                moneda: 'ARS',
                plazoEntrega: 'No especificado', // No viene en la respuesta de tarifas
                servicio: 'Estándar',
                entorno,
                // Datos adicionales de la respuesta
                pesoAforado: data.pesoAforado,
                tarifaSinIva: data.tarifaSinIva,
                tarifaConIva: data.tarifaConIva,
            };

            console.log(`✅ [Andreani] Cotización exitosa: $${precio} ARS (con IVA)`);

            return respuestaNormalizada;
        } catch (error: any) {
            console.error(`❌ [Andreani] Error al cotizar envío:`, error.message);
            throw error;
        }
    }
}

// Exportar instancia singleton
export const andreaniEnviosService = new AndreaniEnviosService();

