-- Agregar campos altura, piso, dpto a la tabla cliente
ALTER TABLE cliente 
ADD COLUMN IF NOT EXISTS altura VARCHAR(20),
ADD COLUMN IF NOT EXISTS piso VARCHAR(20),
ADD COLUMN IF NOT EXISTS dpto VARCHAR(20);

-- Comentarios para documentación
COMMENT ON COLUMN cliente.altura IS 'Altura (número) de la dirección';
COMMENT ON COLUMN cliente.piso IS 'Piso (opcional)';
COMMENT ON COLUMN cliente.dpto IS 'Departamento (opcional)';


