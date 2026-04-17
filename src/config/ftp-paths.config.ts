import dotenv from 'dotenv';

dotenv.config();

const DEFAULTS = {
  bases: '/Tekno/Bases',
  facturas: '/Tekno/Facturas',
  andreani: '/Tekno/Andreani',
  pedidoDir: '/Tekno/Pedido',
  ventasExcel: '/Tekno/Pedido/Ventas.xlsx',
  clientesExcel: '/Tekno/Pedido/Clientes.xlsx',
} as const;

function normalizePath(value: string | undefined, fallback: string): string {
  const raw = (value || '').trim();
  if (!raw) return fallback;
  return raw.startsWith('/') ? raw : `/${raw}`;
}

export const ftpPathsConfig = {
  bases: normalizePath(process.env.FTP_PATH_BASES, DEFAULTS.bases),
  facturas: normalizePath(process.env.FTP_PATH_FACTURAS, DEFAULTS.facturas),
  andreani: normalizePath(process.env.FTP_PATH_ANDREANI, DEFAULTS.andreani),
  pedidoDir: normalizePath(process.env.FTP_PATH_PEDIDO_DIR, DEFAULTS.pedidoDir),
  ventasExcel: normalizePath(process.env.FTP_PATH_PEDIDO_VENTAS_XLSX, DEFAULTS.ventasExcel),
  clientesExcel: normalizePath(process.env.FTP_PATH_PEDIDO_CLIENTES_XLSX, DEFAULTS.clientesExcel),
};

