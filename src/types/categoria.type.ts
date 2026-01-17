import { IProductos } from "./product.type";

export interface ICategoria {
    id_cat: number;
    codi_categoria: string;
    nombre?: string | null;
    descripcion?: string | null;
    activo?: boolean | null;
    creado_en?: Date | null;
    actualizado_en?: Date | null;
    // Relaciones
    productos?: IProductos[];
}
export interface ISubcategoria {
    id_subcat: number;
    id_cat?: number | null;
    nombre?: string | null;
    descripcion?: string | null;
    // Relaciones
    categoria?: ICategoria | null;
    productos?: IProductos[];
}

export interface ICreateCategoriaDTO {
    codi_categoria: string;
    nombre: string;
    descripcion?: string;
}

export interface IUpdateCategoriaDTO {
    nombre?: string;
    descripcion?: string;
}

export interface ICreateSubcategoriaDTO {
    id_cat: number;
    nombre: string;
    descripcion?: string;
}

export interface IUpdateSubcategoriaDTO {
    id_cat?: number;
    nombre?: string;
    descripcion?: string;
}