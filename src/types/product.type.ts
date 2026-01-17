import { EstadoGeneral, IIva, IMarca } from ".";
import { ICategoria } from "./categoria.type";

export interface IProductos {
    id_prod: number;
    codi_arti: string;
    codi_categoria?: string | null;
    codi_marca?: string | null;
    codi_grupo?: string | null;
    codi_impuesto?: string | null;
    id_interno?: string | null;
    cod_sku?: string | null;
    nombre?: string | null;
    descripcion?: string | null;
    modelo?: string | null;
    precio_mayorista?: number | null;
    precio_minorista?: number | null;
    precio_evento?: number | null;
    precio?: number | null;
    precio_sin_iva?: number | null;
    iva_monto?: number | null;
    stock?: number | null;
    stock_min?: number | null;
    stock_mayorista?: number | null;
    unidad_medida?: string | null;
    unidades_por_producto?: number | null;
    codi_barras?: string | null;
    img_principal?: string | null;
    imagenes?: string[] | null; // JSONB
    destacado?: boolean | null;
    financiacion?: boolean | null;
    activo?: string | null;
    creado_en?: Date | null;
    actualizado_en?: Date | null;
    estado?: EstadoGeneral | null;
    // Relaciones
    categoria?: ICategoria | null;
    marca?: IMarca | null;
    grupo?: any | null; // IGrupo
    iva?: IIva | null;
}

export interface ICrearProductoContenido {
    marcas: IMarca[];
    categorias: ICategoria[];
    grupos: any[]; // IGrupo[]
    ivas: IIva[];
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
    precio: number;
    precio_mayorista?: number;
    precio_minorista?: number;
    stock?: number;
    unidad_medida?: string;
    unidades_por_producto?: number;
    codi_barras?: string;
    cod_sku?: string;
    img_principal?: string;
    imagenes?: string[];
    destacado?: boolean;
    // Campos legacy para compatibilidad
    id_cat?: number;
    id_subcat?: number;
    id_marca?: number;
    id_iva?: number;
}

// Para actualizar producto
export interface IUpdateProductoDTO extends Partial<ICreateProductoDTO> {
    estado?: EstadoGeneral;
}