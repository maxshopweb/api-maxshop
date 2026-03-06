/**
 * Servicio para generar el Excel de clientes (exportación on-demand).
 * Una hoja "Clientes", una fila por cliente, columnas según formato acordado.
 */

import * as XLSX from 'xlsx';
import { ICliente } from '../types';

const SHEET_NAME = 'Clientes';

/** Formato de fecha para columnas de fecha (consistente con Excel de ventas) */
function formatFecha(fecha: Date | null | undefined): string {
    if (!fecha) return '';
    const d = new Date(fecha);
    const meses = [
        'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
        'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
    ];
    const dia = d.getDate();
    const mes = meses[d.getMonth()];
    const año = d.getFullYear();
    const horas = d.getHours().toString().padStart(2, '0');
    const minutos = d.getMinutes().toString().padStart(2, '0');
    return `${dia} de ${mes} de ${año} ${horas}:${minutos} hs.`;
}

/** Headers del Excel (fila 3, índice 2) */
const HEADERS = [
    'numero_cliente',
    'id_cliente',
    'id_usuario',
    'nombre',
    'apellido',
    'email',
    'telefono',
    'tipo_documento',
    'numero_documento',
    'direccion',
    'altura',
    'piso',
    'dpto',
    'cod_postal',
    'ciudad',
    'provincia',
    'creado_en',
    'actualizado_en',
    'ultimo_login',
    'nacimiento',
    'activo',
    'estado',
];

/**
 * Genera un workbook XLSX con todos los clientes.
 * Fila 1-2 vacías, fila 3 headers, desde fila 4 datos.
 */
export function buildClientesWorkbook(clientes: ICliente[]): XLSX.WorkBook {
    const workbook = XLSX.utils.book_new();
    const data: (string | number | null)[][] = [];

    // Filas 1 y 2 vacías
    data.push([]);
    data.push([]);
    // Fila 3: headers
    data.push(HEADERS);

    for (const c of clientes) {
        const u = c.usuario;
        const row: (string | number | null)[] = [
            c.numero_cliente ?? '',
            c.id_cliente ?? '',
            c.id_usuario ?? '',
            u?.nombre ?? '',
            u?.apellido ?? '',
            u?.email ?? '',
            u?.telefono ?? '',
            u?.tipo_documento ?? '',
            u?.numero_documento ?? '',
            c.direccion ?? '',
            c.altura ?? '',
            c.piso ?? '',
            c.dpto ?? '',
            c.cod_postal ?? '',
            c.ciudad ?? '',
            c.provincia ?? '',
            u?.creado_en ? formatFecha(new Date(u.creado_en)) : '',
            u?.actualizado_en ? formatFecha(new Date(u.actualizado_en)) : '',
            u?.ultimo_login ? formatFecha(new Date(u.ultimo_login)) : '',
            u?.nacimiento ? formatFecha(new Date(u.nacimiento)) : '',
            u?.activo != null ? (u.activo ? 'Sí' : 'No') : '',
            u?.estado != null ? String(u.estado) : '',
        ];
        data.push(row);
    }

    const worksheet = XLSX.utils.aoa_to_sheet(data);

    // Ajustar ancho de columnas (opcional)
    const colWidths = HEADERS.map((_, i) => ({
        wch: i === 2 ? 24 : i >= 3 && i <= 8 ? 18 : 14,
    }));
    worksheet['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(workbook, worksheet, SHEET_NAME);
    return workbook;
}

/**
 * Genera el buffer del archivo Excel (para enviar por HTTP o escribir a disco).
 */
export function buildClientesExcelBuffer(clientes: ICliente[]): Buffer {
    const workbook = buildClientesWorkbook(clientes);
    return Buffer.from(
        XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', cellStyles: false })
    );
}
