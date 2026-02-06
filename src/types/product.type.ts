import { EstadoGeneral, IIva, IListaPrecio, IMarca, ISituacionFiscal } from ".";
import { ICategoria } from "./categoria.type";

/** Info de la lista activa solo para UI (oferta/campaña). Nombre de lista no se expone. */
export interface IListaActivaInfo {
    codi_lista: string;
    tipo_lista: string | null;
    es_oferta?: boolean;
    es_campanya?: boolean;
}

export interface IProductos {
    id_prod: number;
    codi_arti: string;
    codi_categoria?: string | null;
    codi_marca?: string | null;
    codi_grupo?: string | null;
    codi_impuesto?: string | null;
    nombre?: string | null;
    descripcion?: string | null;
    precio_venta?: number | null;
    precio_especial?: number | null;
    precio_pvp?: number | null;
    precio_campanya?: number | null;
    lista_precio_activa?: string | null; // V|O|P|Q
    /** Lista activa resuelta (nombre, tipo) para que el front distinga oferta/campaña/normal */
    lista_activa?: IListaActivaInfo | null;
    /** Precio final con IVA aplicado (calculado en backend para el front) */
    precio?: number | null;
    stock?: number | null;
    stock_min?: number | null;
    unidad_medida?: string | null;
    unidades_por_producto?: number | null;
    codi_barras?: string | null;
    img_principal?: string | null;
    imagenes?: string[] | null;
    destacado?: boolean | null;
    publicado?: boolean | null;
    financiacion?: boolean | null;
    activo?: string | null;
    creado_en?: Date | null;
    actualizado_en?: Date | null;
    estado?: EstadoGeneral | null;
    categoria?: ICategoria | null;
    marca?: IMarca | null;
    grupo?: any | null;
    iva?: IIva | null;
}

export interface ICrearProductoContenido {
    marcas: IMarca[];
    categorias: ICategoria[];
    grupos: any[]; // IGrupo[]
    ivas: IIva[];
    listasPrecio: IListaPrecio[];
    situacionesFiscales: ISituacionFiscal[];
}

export interface IProductoFilters {
    id_subcat?: number; // Deprecated - mantener por compatibilidad
    id_cat?: number | string; // Puede ser ID o código
    id_marca?: number | string; // Puede ser ID o código
    codi_grupo?: string; // Código de grupo
    codi_impuesto?: string | number; // Código de IVA o ID
    precio_min?: number;
    precio_max?: number;
    destacado?: boolean;
    financiacion?: boolean;
    stock_bajo?: boolean;
    busqueda?: string;
    estado?: EstadoGeneral; // Solo para admin: 1 = activo, 2 = inactivo (NUNCA 0 = eliminado)
    activo?: string; // Filtro por publicar/despublicar: "A" = publicado, "I" = despublicado
    publicado?: boolean; // Filtro admin: solo publicados / no publicados en tienda
    page?: number;
    limit?: number;
    order_by?: 'precio' | 'nombre' | 'creado_en' | 'stock';
    order?: 'asc' | 'desc';
}

// Para crear producto
export interface ICreateProductoDTO {
    codi_arti: string;
    codi_categoria?: string;
    codi_marca?: string;
    codi_grupo?: string;
    codi_impuesto?: string;
    nombre: string;
    descripcion?: string;
    precio_venta?: number | null;
    precio_especial?: number | null;
    precio_pvp?: number | null;
    precio_campanya?: number | null;
    lista_precio_activa?: string | null; // V|O|P|Q
    stock?: number;
    stock_min?: number | null;
    unidad_medida?: string;
    unidades_por_producto?: number;
    codi_barras?: string;
    img_principal?: string;
    imagenes?: string[] | null;
    destacado?: boolean;
    financiacion?: boolean;
    id_cat?: number;
    id_subcat?: number;
    id_marca?: number;
    id_iva?: number;
    cod_sku?: string;
    id_interno?: string;
    modelo?: string;
    precio_mayorista?: number | null;
    precio_minorista?: number | null;
    precio_evento?: number | null;
    stock_mayorista?: number | null;
}

// Para actualizar producto
export interface IUpdateProductoDTO extends Partial<ICreateProductoDTO> {
    estado?: EstadoGeneral;
    publicado?: boolean;
}

/** Respuesta de operación bulk de publicado */
export interface IBulkPublicadoResult {
    count: number;
}
