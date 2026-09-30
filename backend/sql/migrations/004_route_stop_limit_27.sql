BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM paradas_rota
     GROUP BY rota_id
    HAVING COUNT(*) > 27
  ) THEN
    RAISE EXCEPTION 'Existing routes exceed the maximum of 27 students; clean them up before applying this migration.';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.validar_limite_de_alunos_da_rota()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  quantidade_de_paradas INTEGER;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.rota_id IS DISTINCT FROM OLD.rota_id THEN
    PERFORM r.id
      FROM rotas r
     WHERE r.id IN (OLD.rota_id, NEW.rota_id)
     ORDER BY r.id
       FOR UPDATE;
  ELSE
    PERFORM r.id
      FROM rotas r
     WHERE r.id = NEW.rota_id
       FOR UPDATE;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT COUNT(*)::INTEGER
      INTO quantidade_de_paradas
      FROM paradas_rota p
     WHERE p.rota_id = NEW.rota_id
       AND p.id <> OLD.id;
  ELSE
    SELECT COUNT(*)::INTEGER
      INTO quantidade_de_paradas
      FROM paradas_rota p
     WHERE p.rota_id = NEW.rota_id;
  END IF;

  IF quantidade_de_paradas >= 27 THEN
    RAISE EXCEPTION 'A rota aceita no máximo 27 alunos.'
      USING ERRCODE = '23514', CONSTRAINT = 'paradas_rota_limite_27';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS paradas_rota_limite_27_insert ON paradas_rota;
CREATE TRIGGER paradas_rota_limite_27_insert
  BEFORE INSERT ON paradas_rota
  FOR EACH ROW EXECUTE FUNCTION public.validar_limite_de_alunos_da_rota();

DROP TRIGGER IF EXISTS paradas_rota_limite_27_update ON paradas_rota;
CREATE TRIGGER paradas_rota_limite_27_update
  BEFORE UPDATE OF rota_id ON paradas_rota
  FOR EACH ROW EXECUTE FUNCTION public.validar_limite_de_alunos_da_rota();

COMMIT;
