BEGIN;

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS responsaveis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  telefone TEXT,
  email TEXT,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS motoristas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  telefone TEXT,
  email TEXT UNIQUE,
  senha_hash TEXT,
  role TEXT NOT NULL DEFAULT 'driver' CONSTRAINT motoristas_role_allowed CHECK (role IN ('driver', 'admin')),
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE motoristas ADD COLUMN IF NOT EXISTS senha_hash TEXT;

CREATE TABLE IF NOT EXISTS escolas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  ponto_geog GEOMETRY(Point, 4326) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT escolas_ponto_geog_srid CHECK (ST_SRID(ponto_geog) = 4326)
);

CREATE TABLE IF NOT EXISTS alunos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id UUID NOT NULL REFERENCES escolas(id) ON DELETE RESTRICT,
  responsavel_id UUID REFERENCES responsaveis(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  foto_url TEXT,
  status TEXT NOT NULL DEFAULT 'Aguardando'
    CHECK (status IN ('Aguardando', 'Embarcado', 'Ausente', 'Desembarcado')),
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS aluno_responsaveis (
  aluno_id UUID NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  responsavel_id UUID NOT NULL REFERENCES responsaveis(id) ON DELETE CASCADE,
  principal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (aluno_id, responsavel_id)
);

CREATE TABLE IF NOT EXISTS enderecos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id UUID NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  ponto_fachada GEOMETRY(Point, 4326) NOT NULL,
  ponto_via GEOMETRY(Point, 4326) NOT NULL,
  -- LineString digitized in the allowed approach direction toward the curb stop.
  trecho_via GEOMETRY(LineString, 4326) NOT NULL,
  logradouro TEXT,
  numero TEXT,
  complemento TEXT,
  principal BOOLEAN NOT NULL DEFAULT true,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT enderecos_ponto_fachada_srid CHECK (ST_SRID(ponto_fachada) = 4326),
  CONSTRAINT enderecos_ponto_via_srid CHECK (ST_SRID(ponto_via) = 4326),
  CONSTRAINT enderecos_trecho_via_srid CHECK (ST_SRID(trecho_via) = 4326),
  CONSTRAINT enderecos_trecho_via_min_points CHECK (ST_NPoints(trecho_via) >= 2)
);

CREATE TABLE IF NOT EXISTS veiculos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  placa TEXT NOT NULL UNIQUE,
  consumo_medio_km_l NUMERIC(7, 3) NOT NULL CHECK (consumo_medio_km_l > 0),
  ponto_garagem GEOMETRY(Point, 4326) NOT NULL,
  lado_porta TEXT NOT NULL DEFAULT 'RIGHT' CHECK (lado_porta = 'RIGHT'),
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT veiculos_ponto_garagem_srid CHECK (ST_SRID(ponto_garagem) = 4326)
);

CREATE TABLE IF NOT EXISTS rotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  motorista_id UUID NOT NULL REFERENCES motoristas(id) ON DELETE RESTRICT,
  veiculo_id UUID NOT NULL REFERENCES veiculos(id) ON DELETE RESTRICT,
  escola_id UUID NOT NULL REFERENCES escolas(id) ON DELETE RESTRICT,
  data_rota DATE NOT NULL DEFAULT CURRENT_DATE,
  distancia_total_km NUMERIC(10, 3) CHECK (distancia_total_km IS NULL OR distancia_total_km >= 0),
  tempo_estimado_min NUMERIC(10, 2) CHECK (tempo_estimado_min IS NULL OR tempo_estimado_min >= 0),
  consumo_estimado_l NUMERIC(10, 3) CHECK (consumo_estimado_l IS NULL OR consumo_estimado_l >= 0),
  geometria_rota GEOMETRY(LineString, 4326),
  CONSTRAINT rotas_geometria_rota_srid
    CHECK (geometria_rota IS NULL OR ST_SRID(geometria_rota) = 4326),
  status TEXT NOT NULL DEFAULT 'planejada'
    CHECK (status IN ('planejada', 'em_andamento', 'concluida', 'cancelada')),
  iniciada_em TIMESTAMPTZ,
  concluida_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS paradas_rota (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rota_id UUID NOT NULL REFERENCES rotas(id) ON DELETE CASCADE,
  aluno_id UUID NOT NULL REFERENCES alunos(id) ON DELETE RESTRICT,
  endereco_id UUID NOT NULL REFERENCES enderecos(id) ON DELETE RESTRICT,
  ordem_otimizada INTEGER NOT NULL CHECK (ordem_otimizada > 0),
  status_parada TEXT NOT NULL DEFAULT 'Aguardando'
    CHECK (status_parada IN ('Aguardando', 'Embarcado', 'Ausente', 'Desembarcado')),
  side_of_street TEXT NOT NULL DEFAULT 'RIGHT' CHECK (side_of_street = 'RIGHT'),
  registrado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT paradas_rota_ordem_unica UNIQUE (rota_id, ordem_otimizada),
  CONSTRAINT paradas_rota_aluno_unico UNIQUE (rota_id, aluno_id)
);

-- Idempotency ledger for offline mobile events (attendance and GPS batches).
CREATE TABLE IF NOT EXISTS sync_event_receipts (
  client_event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN ('attendance_status', 'gps_location')),
  route_id UUID REFERENCES rotas(id) ON DELETE SET NULL,
  payload JSONB NOT NULL,
  client_created_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gps_localizacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_event_id TEXT NOT NULL UNIQUE REFERENCES sync_event_receipts(client_event_id) ON DELETE CASCADE,
  rota_id UUID REFERENCES rotas(id) ON DELETE SET NULL,
  ponto GEOMETRY(Point, 4326) NOT NULL,
  precisao_m NUMERIC(8, 2),
  altitude_m NUMERIC(9, 2),
  direcao_graus NUMERIC(6, 2),
  velocidade_m_s NUMERIC(8, 3),
  registrado_em TIMESTAMPTZ NOT NULL,
  CONSTRAINT gps_localizacoes_ponto_srid CHECK (ST_SRID(ponto) = 4326)
);

CREATE INDEX IF NOT EXISTS idx_escolas_ponto_geog ON escolas USING GIST (ponto_geog);
CREATE INDEX IF NOT EXISTS idx_enderecos_ponto_fachada ON enderecos USING GIST (ponto_fachada);
CREATE INDEX IF NOT EXISTS idx_enderecos_ponto_via ON enderecos USING GIST (ponto_via);
CREATE INDEX IF NOT EXISTS idx_veiculos_ponto_garagem ON veiculos USING GIST (ponto_garagem);
CREATE INDEX IF NOT EXISTS idx_alunos_escola_ativo ON alunos (escola_id, ativo);
CREATE INDEX IF NOT EXISTS idx_aluno_responsaveis_responsavel ON aluno_responsaveis (responsavel_id);
CREATE INDEX IF NOT EXISTS idx_rotas_motorista_status ON rotas (motorista_id, status);
CREATE INDEX IF NOT EXISTS idx_motoristas_email_lower
  ON motoristas (lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rotas_geometria ON rotas USING GIST (geometria_rota);
CREATE INDEX IF NOT EXISTS idx_paradas_rota_ordem ON paradas_rota (rota_id, ordem_otimizada);
CREATE INDEX IF NOT EXISTS idx_sync_event_receipts_route_date ON sync_event_receipts (route_id, client_created_at);
CREATE INDEX IF NOT EXISTS idx_gps_localizacoes_rota_data ON gps_localizacoes (rota_id, registrado_em);
CREATE INDEX IF NOT EXISTS idx_gps_localizacoes_ponto ON gps_localizacoes USING GIST (ponto);

COMMIT;
