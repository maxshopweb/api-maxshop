/**
 * TESTS: cargarPrecios mapea CODILIST=E a precioManual
 * npm test -- csv-importer-precios
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { CSVImporterService } from '../sincronizacion/csv-importer.service';

jest.mock('@prisma/client', () => ({
    Prisma: {},
    PrismaClient: jest.fn().mockImplementation(() => ({})),
}));

function writeMaesprec(rows: string[]): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maesprec-'));
    const filePath = path.join(dir, 'maesprec.csv');
    const header = 'ORDEPREC,GRARARTI,CODILIST,ANTEPREC,FEANPREC,ACTUPREC';
    fs.writeFileSync(filePath, [header, ...rows].join('\n'), 'utf-8');
    return filePath;
}

describe('CSVImporterService.cargarPrecios', () => {
    const importer = new CSVImporterService();

    it('asigna CODILIST E a precioManual y no pisa V/O/P/Q', () => {
        const csvPath = writeMaesprec([
            '1,ART001,V,0,,1000',
            '2,ART001,O,0,,800',
            '3,ART001,P,0,,1200',
            '4,ART001,Q,0,,700',
            '5,ART001,E,0,,650',
        ]);

        const map = importer.cargarPrecios(csvPath);
        const precios = map.get('ART001');
        expect(precios).toEqual({
            precioVenta: 1000,
            precioEspecial: 800,
            precioPvp: 1200,
            precioCampanya: 700,
            precioManual: 650,
            precioCosto: null,
        });
    });

    it('si hay varios E, queda el mayor', () => {
        const csvPath = writeMaesprec([
            '1,ART002,E,0,,100',
            '2,ART002,E,0,,250',
            '3,ART002,V,0,,900',
        ]);

        const precios = importer.cargarPrecios(csvPath).get('ART002');
        expect(precios?.precioManual).toBe(250);
        expect(precios?.precioVenta).toBe(900);
    });

    it('producto solo con E no queda sin precioManual', () => {
        const csvPath = writeMaesprec(['1,ART003,E,0,,1999.5']);
        const precios = importer.cargarPrecios(csvPath).get('ART003');
        expect(precios?.precioManual).toBe(1999.5);
        expect(precios?.precioVenta).toBeNull();
    });
});
