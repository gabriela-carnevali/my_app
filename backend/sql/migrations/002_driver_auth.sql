BEGIN;

ALTER TABLE motoristas ADD COLUMN IF NOT EXISTS senha_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_motoristas_email_lower
  ON motoristas (lower(email)) WHERE email IS NOT NULL;

COMMIT;
