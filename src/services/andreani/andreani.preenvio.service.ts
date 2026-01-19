/**
 * Servicio de Pre-envíos de Andreani
 * 
 * Maneja las operaciones relacionadas con PRE-ENVÍOS (órdenes de envío):
 * - POST: Crear pre-envío
 * - GET: Consultar pre-envío
 * 
 * REGLA DE NEGOCIO:
 * - El pre-envío se crea únicamente cuando la venta está CONFIRMADA (estado_pago = 'aprobado')
 * - El pre-envío puede estar en estados: Pendiente, Solicitado, Creada, Rechazado
 */

import { prisma } from '../../index';
import { andreaniApiService } from './andreani.api.service';
import {
    ICreateOrdenEnvioRequest,
    IOrdenEnvioResponse,
    IDomicilioCompleto,
    IConsultaOrdenResponse,
    IApiResult,
} from './andreani.types';
import mailService from '../../mail';

export class AndreaniPreEnvioService {
    /**
     * Crea un pre-envío en Andreani
     * POST /v2/ordenes-de-envio
     * 
     * IMPORTANTE: Solo se puede crear si la venta está confirmada (estado_pago = 'aprobado')
     * 
     * @param idVenta - ID de la venta confirmada
     * @param datosEnvio - Datos del envío (opcional, se pueden inferir de la venta)
     * @returns Pre-envío creado
     */
    async crearPreEnvio(
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
            if (venta.estado_pago !== 'aprobado') {
                throw new Error(
                    `La venta ${idVenta} no está confirmada. ` +
                    `Estado actual: ${venta.estado_pago}. ` +
                    `Solo se pueden crear pre-envíos para ventas con estado_pago = 'aprobado'`
                );
            }
            
            // Validar que la venta tenga cliente y datos necesarios
            if (!venta.cliente) {
                throw new Error(`La venta ${idVenta} no tiene cliente asociado`);
            }
            
            // Validar datos de dirección del cliente (más estricto)
            const direccionCompleta = venta.cliente.direccion?.trim();
            const ciudadCompleta = venta.cliente.ciudad?.trim();
            const codigoPostalCompleto = venta.cliente.cod_postal?.toString()?.trim();

            if (!direccionCompleta) {
                throw new Error(
                    `La venta ${idVenta} no tiene dirección del cliente. ` +
                    `Por favor, complete la dirección del cliente antes de crear el envío.`
                );
            }

            if (!ciudadCompleta) {
                throw new Error(
                    `La venta ${idVenta} no tiene ciudad del cliente. ` +
                    `Ciudad del cliente: "${venta.cliente.ciudad || 'N/A'}". ` +
                    `Por favor, complete la ciudad del cliente antes de crear el envío.`
                );
            }

            if (!codigoPostalCompleto || codigoPostalCompleto === '0' || codigoPostalCompleto === '0000') {
                throw new Error(
                    `La venta ${idVenta} no tiene código postal válido del cliente. ` +
                    `Código postal: "${codigoPostalCompleto || 'N/A'}". ` +
                    `Por favor, complete el código postal del cliente antes de crear el envío.`
                );
            }

            // 3. Verificar si ya existe un pre-envío para esta venta
            const envioExistente = await prisma.envios.findFirst({
                where: { id_venta: idVenta },
            });

            if (envioExistente && envioExistente.cod_seguimiento) {
                throw new Error(
                    `Ya existe un pre-envío para la venta ${idVenta}. ` +
                    `Código de seguimiento: ${envioExistente.cod_seguimiento}`
                );
            }

            // 4. Preparar datos del pre-envío
            const ordenEnvio = await this.prepararDatosOrdenEnvio(venta, datosEnvio);

            // 5. Crear pre-envío en Andreani
            const result = await andreaniApiService.post<IOrdenEnvioResponse>(
                '/v2/ordenes-de-envio',
                ordenEnvio
            );

            if (!result.success || !result.data) {
                console.error(`❌ [Andreani Pre-envío] Error en respuesta de API:`, result);
                throw new Error(
                    result.error || 'Error al crear pre-envío en Andreani'
                );
            }

            const preEnvioCreado = result.data;
            
            // Extraer número de envío (tracking) del primer bulto
            const numeroEnvio = preEnvioCreado.bultos?.[0]?.numeroDeEnvio || null;
            

            // 6. Guardar pre-envío en BD
            const envio = await prisma.envios.create({
                data: {
                    id_venta: idVenta,
                    empresa_envio: 'andreani',
                    cod_seguimiento: numeroEnvio,
                    estado_envio: this.mapearEstadoPreEnvio(preEnvioCreado.estado),
                    costo_envio: null, // No viene en la respuesta del pre-envío
                    fecha_envio: new Date(),
                    observaciones: `Pre-envío Andreani. Estado: ${preEnvioCreado.estado}. Agrupador: ${preEnvioCreado.agrupadorDeBultos}. Etiquetas: ${preEnvioCreado.etiquetasPorAgrupador || 'N/A'}`,
                },
            });

            // 7. Actualizar venta con id_envio
            await prisma.venta.update({
                where: { id_venta: idVenta },
                data: {
                    id_envio: envio.id_envio,
                    estado_envio: this.mapearEstadoPreEnvio(preEnvioCreado.estado),
                },
            });

            // 8. Enviar email al cliente con el número de envío (no bloqueante)
            if (numeroEnvio && venta.cliente?.usuarios?.email) {
                mailService.sendShippingSent({
                    orderId: idVenta,
                    trackingCode: numeroEnvio,
                    carrier: 'Andreani',
                    cliente: {
                        email: venta.cliente.usuarios.email,
                        nombre: venta.cliente.usuarios.nombre || 'Cliente',
                    },
                }).catch((error) => {
                    console.error(`❌ [Andreani Pre-envío] Error al enviar email de envío para venta ${idVenta}:`, error);
                    // No lanzar error para no interrumpir el flujo
                });
            } else {
                console.warn(`⚠️ [Andreani Pre-envío] No se pudo enviar email de envío para venta ${idVenta}. Número de envío: ${numeroEnvio || 'N/A'}, Email: ${venta.cliente?.usuarios?.email || 'N/A'}`);
            }

            return preEnvioCreado;
        } catch (error: any) {
            console.error(`❌ [Andreani Pre-envío] Error al crear pre-envío para venta ${idVenta}:`, error.message);
            throw error;
        }
    }

    /**
     * Consulta un pre-envío por número de envío
     * GET /v2/ordenes-de-envio/{numeroDeEnvio}
     * 
     * @param numeroDeEnvio - Número de envío del pre-envío
     * @returns Datos del pre-envío
     */
    async consultarPreEnvio(numeroDeEnvio: string): Promise<IConsultaOrdenResponse> {
        try {
            if (!numeroDeEnvio) {
                throw new Error('Se debe proporcionar numeroDeEnvio');
            }

            const endpoint = `/v2/ordenes-de-envio/${numeroDeEnvio}`;
            const result = await andreaniApiService.get<IConsultaOrdenResponse>(endpoint);

            if (!result.success || !result.data) {
                throw new Error(
                    result.error || 'Error al consultar pre-envío'
                );
            }

            // Actualizar estado en BD si existe el envío
            const envio = await prisma.envios.findFirst({
                where: { cod_seguimiento: numeroDeEnvio },
            });

            if (envio && result.data.estado) {
                await prisma.envios.update({
                    where: { id_envio: envio.id_envio },
                    data: {
                        estado_envio: this.mapearEstadoPreEnvio(result.data.estado),
                    },
                });

                if (envio.id_venta) {
                    await prisma.venta.update({
                        where: { id_venta: envio.id_venta },
                        data: {
                            estado_envio: this.mapearEstadoPreEnvio(result.data.estado),
                        },
                    });
                }
            }

            return result.data;
        } catch (error: any) {
            console.error(`❌ [Andreani Pre-envío] Error al consultar pre-envío:`, error.message);
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
        const negocio = await prisma.$queryRaw<Array<{
            id_neg: number;
            nombre: string | null;
            direccion: string | null;
            telefono: string | null;
            cuit: string | null;
            email: string | null;
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
        const origenCP = process.env.ANDREANI_ORIGEN_CP?.trim();
        const origenLocalidad = process.env.ANDREANI_ORIGEN_LOCALIDAD?.trim();
        const origenRegion = process.env.ANDREANI_ORIGEN_REGION?.trim();

        // Validar datos de origen
        if (!origenCP || origenCP === '0000') {
            throw new Error(
                'ANDREANI_ORIGEN_CP no está configurado correctamente. ' +
                'Por favor, configure un código postal válido en las variables de entorno.'
            );
        }

        if (!origenLocalidad) {
            throw new Error(
                'ANDREANI_ORIGEN_LOCALIDAD no está configurado. ' +
                'Por favor, configure la localidad de origen en las variables de entorno.'
            );
        }

        if (!origenRegion) {
            throw new Error(
                'ANDREANI_ORIGEN_REGION no está configurado. ' +
                'Por favor, configure la región de origen (ej: CB, BA, SF) en las variables de entorno.'
            );
        }

        const origenPostal: IDomicilioCompleto = {
            codigoPostal: origenCP,
            calle: negocioData.direccion?.split(',')[0] || '',
            numero: '0',
            localidad: origenLocalidad,
            region: origenRegion,
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

        // Obtener calle del cliente (ya validada arriba, pero asegurarse de que no esté vacía)
        const calleCliente = cliente.direccion?.split(',')[0]?.trim() || 
                             datosAdicionales?.destino?.postal?.calle?.trim() || 
                             '';

        // Validar que la calle no esté vacía (debería estar validada arriba, pero por seguridad)
        if (!calleCliente) {
            throw new Error(
                `La venta ${venta.id_venta} no tiene una calle válida para el envío. ` +
                `Dirección del cliente: "${cliente.direccion || 'N/A'}". ` +
                `Por favor, complete la dirección del cliente antes de crear el envío.`
            );
        }

        // Obtener y validar código postal del cliente
        const codigoPostalCliente = cliente.cod_postal?.toString()?.trim();

        if (!codigoPostalCliente || codigoPostalCliente === '0' || codigoPostalCliente === '0000') {
            throw new Error(
                `La venta ${venta.id_venta} no tiene un código postal válido para el envío. ` +
                `Código postal del cliente: "${cliente.cod_postal || 'N/A'}". ` +
                `Por favor, complete el código postal del cliente antes de crear el envío.`
            );
        }

        const destinoPostal: IDomicilioCompleto = {
            codigoPostal: codigoPostalCliente || datosAdicionales?.destino?.postal?.codigoPostal || '0000',
            calle: calleCliente,
            numero: datosAdicionales?.destino?.postal?.numero || '0',
            localidad: cliente.ciudad || datosAdicionales?.destino?.postal?.localidad || '',
            region: mapearProvinciaARegion(cliente.provincia) || datosAdicionales?.destino?.postal?.region || '',
            pais: 'AR',
        };

        // Validar otros campos requeridos
        if (!destinoPostal.localidad) {
            throw new Error(
                `La venta ${venta.id_venta} no tiene una localidad válida para el envío. ` +
                `Ciudad del cliente: "${cliente.ciudad || 'N/A'}". ` +
                `Por favor, complete la ciudad del cliente antes de crear el envío.`
            );
        }

        if (!destinoPostal.codigoPostal || destinoPostal.codigoPostal === '0000') {
            throw new Error(
                `La venta ${venta.id_venta} no tiene un código postal válido para el envío. ` +
                `Código postal del cliente: "${cliente.cod_postal || 'N/A'}". ` +
                `Por favor, complete el código postal del cliente antes de crear el envío.`
            );
        }

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

        // Construir orden de envío para POST
        const ordenEnvio: ICreateOrdenEnvioRequest = {
            contrato,
            // NO incluir campos undefined - solo incluir si tienen valor
            ...(datosAdicionales?.tipoDeServicio && { tipoDeServicio: datosAdicionales.tipoDeServicio }),
            ...(datosAdicionales?.sucursalClienteID && { sucursalClienteID: datosAdicionales.sucursalClienteID }),
            
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
            
            // Campos opcionales - solo incluir si tienen valor
            ...(datosAdicionales?.remito && { remito: datosAdicionales.remito }),
            ...(datosAdicionales?.centroDeCostos && { centroDeCostos: datosAdicionales.centroDeCostos }),
            ...(datosAdicionales?.productoAEntregar && { productoAEntregar: datosAdicionales.productoAEntregar }),
            ...(datosAdicionales?.productoARetirar && { productoARetirar: datosAdicionales.productoARetirar }),
            ...(datosAdicionales?.tipoProducto && { tipoProducto: datosAdicionales.tipoProducto }),
            ...(datosAdicionales?.categoriaFacturacion && { categoriaFacturacion: datosAdicionales.categoriaFacturacion }),
            ...(datosAdicionales?.pagoDestino !== undefined && { pagoDestino: datosAdicionales.pagoDestino }),
            ...(datosAdicionales?.valorACobrar !== undefined && { valorACobrar: datosAdicionales.valorACobrar }),
            ...(datosAdicionales?.fechaDeEntrega && { fechaDeEntrega: datosAdicionales.fechaDeEntrega }),
            ...(datosAdicionales?.codigoVerificadorDeEntrega && { codigoVerificadorDeEntrega: datosAdicionales.codigoVerificadorDeEntrega }),
            ...(datosAdicionales?.pagoPendienteEnMostrador !== undefined && { pagoPendienteEnMostrador: datosAdicionales.pagoPendienteEnMostrador }),
        };

        return ordenEnvio;
    }

    /**
     * Calcula los bultos a partir de los detalles de la venta
     */
    private calcularBultos(detalles: any[], idVenta: number): Array<{
        kilos: number;
        largoCm: number;
        altoCm: number;
        anchoCm: number;
        valorDeclarado: number;
        descripcion: string;
    }> {
        const pesoTotal = detalles.reduce((acc, detalle) => {
            return acc + (detalle.cantidad || 1);
        }, 0);

        const valorDeclarado = detalles.reduce((acc, detalle) => {
            return acc + ((detalle.precio_unitario || 0) * (detalle.cantidad || 0));
        }, 0);

        return [
            {
                kilos: Math.max(pesoTotal, 1),
                altoCm: 10,
                anchoCm: 20,
                largoCm: 30,
                valorDeclarado: Math.max(valorDeclarado, 0),
                descripcion: `Productos de la venta #${idVenta}`,
            },
        ];
    }

    /**
     * Mapea el estado del pre-envío al estado interno
     */
    private mapearEstadoPreEnvio(estadoAndreani: string): string {
        const estados: Record<string, string> = {
            'pendiente': 'pendiente',
            'solicitado': 'preparando',
            'solicitada': 'preparando',
            'creada': 'preparando',
            'creado': 'preparando',
            'rechazado': 'cancelado',
            'rechazada': 'cancelado',
        };

        return estados[estadoAndreani.toLowerCase()] || estadoAndreani.toLowerCase();
    }
}

// Exportar instancia singleton
export const andreaniPreEnvioService = new AndreaniPreEnvioService();

