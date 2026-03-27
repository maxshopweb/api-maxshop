import { Request } from 'express';

export const ADMIN_DEFAULT_PAGE = 1;
export const ADMIN_DEFAULT_LIMIT = 10;
export const ADMIN_MAX_LIMIT = 100;

export function shouldPaginateAdminList(req: Request): boolean {
  return req.query.page !== undefined || req.query.limit !== undefined;
}

export function parseAdminListQuery(req: Request): { page: number; limit: number; busqueda: string } {
  const pageRaw = Number(req.query.page);
  const limitRaw = Number(req.query.limit);
  let limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : ADMIN_DEFAULT_LIMIT;
  limit = Math.min(ADMIN_MAX_LIMIT, Math.max(1, limit));
  const page =
    Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : ADMIN_DEFAULT_PAGE;
  const busquedaRaw = req.query.busqueda;
  const busqueda =
    typeof busquedaRaw === 'string'
      ? busquedaRaw.trim().slice(0, 80)
      : Array.isArray(busquedaRaw) && typeof busquedaRaw[0] === 'string'
        ? busquedaRaw[0].trim().slice(0, 80)
        : '';
  return { page, limit, busqueda };
}

export type AdminPaginationMeta = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
};

export function buildPaginationMeta(
  total: number,
  page: number,
  limit: number
): AdminPaginationMeta {
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  let safePage = page;
  if (totalPages > 0) {
    safePage = Math.min(Math.max(1, page), totalPages);
  } else {
    safePage = 1;
  }
  return {
    total,
    page: safePage,
    limit,
    totalPages,
    hasNextPage: totalPages > 0 && safePage < totalPages,
    hasPrevPage: safePage > 1,
  };
}
