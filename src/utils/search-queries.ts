import { prisma } from '../index';
import {
  buildCodigoNombreSearchSql,
  buildProductoTextSearchSql,
  buildUsuarioTextSearchSql,
  buildVentaTextSearchSql,
} from './search.utils';

/** Sin coincidencias para filtros Prisma `in`. */
export const EMPTY_ID_FILTER = -1 as const;

export async function findClienteUsuarioIdsByTextSearch(
  busqueda: string
): Promise<string[]> {
  const searchSql = buildUsuarioTextSearchSql(busqueda, 'u');
  if (!searchSql) return [];
  const rows = await prisma.$queryRaw<{ id_usuario: string }[]>`
    SELECT u.id_usuario
    FROM usuarios u
    WHERE u.admin IS NULL
      AND ${searchSql}
  `;
  return rows.map((r) => r.id_usuario);
}

export async function findStaffUsuarioIdsByTextSearch(
  busqueda: string
): Promise<string[]> {
  const searchSql = buildUsuarioTextSearchSql(busqueda, 'u');
  if (!searchSql) return [];
  const rows = await prisma.$queryRaw<{ id_usuario: string }[]>`
    SELECT u.id_usuario
    FROM usuarios u
    INNER JOIN admin a ON a.id_usuario = u.id_usuario
    WHERE ${searchSql}
  `;
  return rows.map((r) => r.id_usuario);
}

export async function findVentaIdsByTextSearch(busqueda: string): Promise<number[]> {
  const searchSql = buildVentaTextSearchSql(busqueda);
  if (!searchSql) return [];
  const rows = await prisma.$queryRaw<{ id_venta: number }[]>`
    SELECT v.id_venta
    FROM venta v
    LEFT JOIN cliente c ON v.id_cliente = c.id_usuario
    LEFT JOIN usuarios u ON c.id_usuario = u.id_usuario
    WHERE ${searchSql}
  `;
  return rows.map((r) => Number(r.id_venta));
}

export async function findMarcaIdsByTextSearch(busqueda: string): Promise<number[]> {
  const searchSql = buildCodigoNombreSearchSql(busqueda, 'm', 'codi_marca', 'nombre');
  if (!searchSql) return [];
  const rows = await prisma.$queryRaw<{ id_marca: number }[]>`
    SELECT m.id_marca FROM marca m WHERE ${searchSql}
  `;
  return rows.map((r) => Number(r.id_marca));
}

export async function findGrupoIdsByTextSearch(busqueda: string): Promise<number[]> {
  const searchSql = buildCodigoNombreSearchSql(busqueda, 'g', 'codi_grupo', 'nombre');
  if (!searchSql) return [];
  const rows = await prisma.$queryRaw<{ id_grupo: number }[]>`
    SELECT g.id_grupo FROM grupo g WHERE ${searchSql}
  `;
  return rows.map((r) => Number(r.id_grupo));
}

export async function findCategoriaIdsByTextSearch(busqueda: string): Promise<number[]> {
  const searchSql = buildCodigoNombreSearchSql(busqueda, 'c', 'codi_categoria', 'nombre');
  if (!searchSql) return [];
  const rows = await prisma.$queryRaw<{ id_cat: number }[]>`
    SELECT c.id_cat FROM categoria c WHERE ${searchSql}
  `;
  return rows.map((r) => Number(r.id_cat));
}

export async function findListaPrecioIdsByTextSearch(busqueda: string): Promise<number[]> {
  const searchSql = buildCodigoNombreSearchSql(busqueda, 'l', 'codi_lista', 'nombre');
  if (!searchSql) return [];
  const rows = await prisma.$queryRaw<{ id_lista: number }[]>`
    SELECT l.id_lista FROM lista_precio l WHERE ${searchSql}
  `;
  return rows.map((r) => Number(r.id_lista));
}

export async function findProductoIdsByTextSearch(busqueda: string): Promise<number[]> {
  const searchSql = buildProductoTextSearchSql(busqueda, 'p');
  if (!searchSql) return [];
  const rows = await prisma.$queryRaw<{ id_prod: number }[]>`
    SELECT p.id_prod FROM productos p WHERE ${searchSql}
  `;
  return rows.map((r) => Number(r.id_prod));
}
