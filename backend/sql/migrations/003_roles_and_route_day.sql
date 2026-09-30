BEGIN;

ALTER TABLE motoristas ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'driver';
ALTER TABLE rotas ADD COLUMN IF NOT EXISTS data_rota DATE NOT NULL DEFAULT CURRENT_DATE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'motoristas_role_allowed'
       AND conrelid = 'motoristas'::regclass
  ) THEN
    ALTER TABLE motoristas
      ADD CONSTRAINT motoristas_role_allowed CHECK (role IN ('driver', 'admin'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_rotas_motorista_data ON rotas (motorista_id, data_rota);

COMMIT;
