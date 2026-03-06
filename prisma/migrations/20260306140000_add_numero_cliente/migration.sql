-- Crear secuencia para numero_cliente (asignación automática en nuevos inserts)
CREATE SEQUENCE IF NOT EXISTS cliente_numero_cliente_seq;

-- Añadir columna (nullable inicialmente para poder backfill)
ALTER TABLE "cliente" ADD COLUMN IF NOT EXISTS "numero_cliente" INTEGER;

-- Asignar valores únicos a filas existentes (orden por id_usuario)
UPDATE "cliente" SET "numero_cliente" = sub.rn
FROM (
  SELECT "id_usuario", row_number() OVER (ORDER BY "id_usuario") AS rn
  FROM "cliente"
) sub
WHERE "cliente"."id_usuario" = sub."id_usuario";

-- Sincronizar la secuencia con el máximo actual (próximos inserts seguirán desde ahí)
SELECT setval(
  'cliente_numero_cliente_seq',
  (SELECT COALESCE(MAX("numero_cliente"), 1) FROM "cliente")
);

-- Hacer la columna NOT NULL y establecer default para nuevos registros
ALTER TABLE "cliente" ALTER COLUMN "numero_cliente" SET NOT NULL;
ALTER TABLE "cliente" ALTER COLUMN "numero_cliente" SET DEFAULT nextval('cliente_numero_cliente_seq'::regclass);

-- Índice único (evita duplicados y permite búsquedas por numero_cliente)
CREATE UNIQUE INDEX IF NOT EXISTS "cliente_numero_cliente_key" ON "cliente"("numero_cliente");
