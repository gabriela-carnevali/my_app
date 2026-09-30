import { LIMITE_DE_ALUNOS_POR_ROTA } from '../config/routeLimits.js';

export function criarRepositorioDeRotas(bancoDeDados) {
  if (!bancoDeDados?.query) throw new TypeError('A PostgreSQL pool is required.');

  return {
    async listarRotasAcessiveis(idDoUsuario, papel) {
      const resultado = await bancoDeDados.query(
        `SELECT r.id,
                to_char(r.data_rota, 'YYYY-MM-DD') AS "routeDate",
                r.status,
                e.nome AS "schoolName",
                r.distancia_total_km AS "distanceKm",
                r.tempo_estimado_min AS "estimatedDurationMinutes",
                (SELECT COUNT(*)::int FROM paradas_rota p WHERE p.rota_id = r.id) AS "stopCount"
           FROM rotas r
           JOIN escolas e ON e.id = r.escola_id
           JOIN motoristas m ON m.id = $1 AND m.ativo = true AND m.role = $2
          WHERE r.status NOT IN ('concluida', 'cancelada')
            AND (m.role = 'admin' OR (r.motorista_id = m.id AND r.data_rota = CURRENT_DATE))
          ORDER BY r.data_rota DESC, e.nome, r.id`,
        [idDoUsuario, papel],
      );
      return resultado.rows;
    },

    async buscarRotaDoMotoristaPorId(idDaRota) {
      const resultado = await bancoDeDados.query(
        `SELECT
           r.id,
           r.status,
           r.distancia_total_km AS "distanceKm",
           r.tempo_estimado_min AS "estimatedDurationMinutes",
           r.consumo_estimado_l AS "estimatedFuelLiters",
           v.consumo_medio_km_l AS "vehicleConsumptionKmPerLiter",
           jsonb_build_object(
             'type', 'van',
             'coordinates', jsonb_build_array(
               ST_X(COALESCE(ST_StartPoint(r.geometria_rota), v.ponto_garagem)),
               ST_Y(COALESCE(ST_StartPoint(r.geometria_rota), v.ponto_garagem))
             )
           ) AS origin,
           jsonb_build_object(
             'type', 'school',
             'id', e.id,
             'name', e.nome,
             'coordinates', jsonb_build_array(ST_X(e.ponto_geog), ST_Y(e.ponto_geog))
           ) AS destination,
           CASE WHEN r.geometria_rota IS NULL THEN NULL
             ELSE ST_AsGeoJSON(r.geometria_rota)::jsonb
           END AS geometry,
           COALESCE((
             SELECT jsonb_agg(
               jsonb_build_object(
                 'id', a.id,
                 'name', a.nome,
                 'photoUrl', a.foto_url,
                 'status', p.status_parada,
                 'order', p.ordem_otimizada,
                 'sideOfStreet', p.side_of_street,
                 'coordinates', jsonb_build_array(ST_X(d.ponto_fachada), ST_Y(d.ponto_fachada)),
                 'streetSegment', jsonb_build_object(
                   'start', jsonb_build_array(ST_X(ST_StartPoint(d.trecho_via)), ST_Y(ST_StartPoint(d.trecho_via))),
                   'end', jsonb_build_array(ST_X(ST_EndPoint(d.trecho_via)), ST_Y(ST_EndPoint(d.trecho_via)))
                 ),
                 'address', jsonb_build_object(
                   'label', concat_ws(', ', d.logradouro, d.numero, d.complemento)
                 )
               ) ORDER BY p.ordem_otimizada
             )
             FROM paradas_rota p
             JOIN alunos a ON a.id = p.aluno_id
             JOIN enderecos d ON d.id = p.endereco_id
             WHERE p.rota_id = r.id
           ), '[]'::jsonb) AS stops
         FROM rotas r
         JOIN veiculos v ON v.id = r.veiculo_id
         JOIN escolas e ON e.id = r.escola_id
         WHERE r.id = $1`,
        [idDaRota],
      );
      return resultado.rows[0] ?? null;
    },

    async salvarGeometriaDaRota({ routeId: idDaRota, geometry: geometria, distanceKm: distanciaEmKm, durationMinutes: duracaoEmMinutos, fuelLiters: consumoEmLitros }) {
      await bancoDeDados.query(
        `UPDATE rotas
            SET geometria_rota = ST_SetSRID(ST_GeomFromGeoJSON($2), 4326),
                distancia_total_km = $3,
                tempo_estimado_min = $4,
                consumo_estimado_l = $5,
                updated_at = now()
          WHERE id = $1`,
        [idDaRota, JSON.stringify(geometria), distanciaEmKm, duracaoEmMinutos, consumoEmLitros],
      );
    },

    async usuarioPodeAcessarRota(idDoUsuario, idDaRota, papel) {
      const resultado = await bancoDeDados.query(
        `SELECT 1 FROM rotas r
           JOIN motoristas m ON m.id = $2 AND m.ativo = true AND m.role = $3
          WHERE r.id = $1 AND (m.role = 'admin' OR r.motorista_id = m.id)
          LIMIT 1`,
        [idDaRota, idDoUsuario, papel],
      );
      return resultado.rowCount > 0;
    },

    async buscarContextoDeEdicaoDaRota(idDaRota) {
      const resultado = await bancoDeDados.query(
        `SELECT
           r.id,
           r.motorista_id AS "driverId",
           r.escola_id AS "schoolId",
           r.status,
           to_char(r.data_rota, 'YYYY-MM-DD') AS "routeDate",
           (r.data_rota = CURRENT_DATE) AS "isToday",
           v.consumo_medio_km_l AS "vehicleConsumptionKmPerLiter",
           jsonb_build_object('id', e.id, 'name', e.nome,
             'coordinates', jsonb_build_array(ST_X(e.ponto_geog), ST_Y(e.ponto_geog))) AS school,
           jsonb_build_array(
             COALESCE((SELECT ST_X(g.ponto) FROM gps_localizacoes g
                        WHERE g.rota_id = r.id ORDER BY g.registrado_em DESC LIMIT 1), ST_X(v.ponto_garagem)),
             COALESCE((SELECT ST_Y(g.ponto) FROM gps_localizacoes g
                        WHERE g.rota_id = r.id ORDER BY g.registrado_em DESC LIMIT 1), ST_Y(v.ponto_garagem))
           ) AS "vanCoordinates",
           COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
               'id', a.id,
               'name', a.nome,
               'photoUrl', a.foto_url,
               'addressId', d.id,
               'status', p.status_parada,
               'order', p.ordem_otimizada,
               'sideOfStreet', p.side_of_street,
               'coordinates', jsonb_build_array(ST_X(d.ponto_fachada), ST_Y(d.ponto_fachada)),
               'streetSegment', jsonb_build_object(
                 'start', jsonb_build_array(ST_X(ST_StartPoint(d.trecho_via)), ST_Y(ST_StartPoint(d.trecho_via))),
                 'end', jsonb_build_array(ST_X(ST_EndPoint(d.trecho_via)), ST_Y(ST_EndPoint(d.trecho_via)))
               ),
               'address', jsonb_build_object('label', concat_ws(', ', d.logradouro, d.numero, d.complemento))
             ) ORDER BY p.ordem_otimizada)
             FROM paradas_rota p
             JOIN alunos a ON a.id = p.aluno_id AND a.ativo = true
             JOIN enderecos d ON d.id = p.endereco_id AND d.ativo = true
             WHERE p.rota_id = r.id
           ), '[]'::jsonb) AS stops
         FROM rotas r
         JOIN veiculos v ON v.id = r.veiculo_id
         JOIN escolas e ON e.id = r.escola_id
         WHERE r.id = $1`,
        [idDaRota],
      );
      return resultado.rows[0] ?? null;
    },

    async buscarAlunosElegiveisDaRota(idDaRota) {
      const resultado = await bancoDeDados.query(
        `SELECT a.id, a.nome AS name, a.foto_url AS "photoUrl", d.id AS "addressId",
                jsonb_build_array(ST_X(d.ponto_fachada), ST_Y(d.ponto_fachada)) AS coordinates,
                jsonb_build_object(
                  'start', jsonb_build_array(ST_X(ST_StartPoint(d.trecho_via)), ST_Y(ST_StartPoint(d.trecho_via))),
                  'end', jsonb_build_array(ST_X(ST_EndPoint(d.trecho_via)), ST_Y(ST_EndPoint(d.trecho_via)))
                ) AS "streetSegment",
                jsonb_build_object('label', concat_ws(', ', d.logradouro, d.numero, d.complemento)) AS address
           FROM rotas r
           JOIN alunos a ON a.escola_id = r.escola_id AND a.ativo = true
           JOIN LATERAL (
             SELECT id, ponto_fachada, trecho_via, logradouro, numero, complemento
               FROM enderecos
              WHERE aluno_id = a.id AND ativo = true AND principal = true
              ORDER BY updated_at DESC
              LIMIT 1
           ) d ON true
          WHERE r.id = $1
            AND NOT EXISTS (
              SELECT 1 FROM paradas_rota p WHERE p.rota_id = r.id AND p.aluno_id = a.id
            )
          ORDER BY a.nome`,
        [idDaRota],
      );
      return resultado.rows;
    },

    async buscarAlunosDaRota(idDaRota, idsDosAlunos) {
      if (idsDosAlunos.length === 0) return [];
      const resultado = await bancoDeDados.query(
        `SELECT a.id, a.nome AS name, a.foto_url AS "photoUrl", d.id AS "addressId",
                'Aguardando' AS status,
                jsonb_build_array(ST_X(d.ponto_fachada), ST_Y(d.ponto_fachada)) AS coordinates,
                jsonb_build_object(
                  'start', jsonb_build_array(ST_X(ST_StartPoint(d.trecho_via)), ST_Y(ST_StartPoint(d.trecho_via))),
                  'end', jsonb_build_array(ST_X(ST_EndPoint(d.trecho_via)), ST_Y(ST_EndPoint(d.trecho_via)))
                ) AS "streetSegment",
                jsonb_build_object('label', concat_ws(', ', d.logradouro, d.numero, d.complemento)) AS address
           FROM rotas r
           JOIN alunos a ON a.escola_id = r.escola_id AND a.ativo = true
           JOIN LATERAL (
             SELECT id, ponto_fachada, trecho_via, logradouro, numero, complemento
               FROM enderecos
              WHERE aluno_id = a.id AND ativo = true AND principal = true
              ORDER BY updated_at DESC
              LIMIT 1
           ) d ON true
          WHERE r.id = $1 AND a.id = ANY($2::uuid[])
          ORDER BY a.nome`,
        [idDaRota, idsDosAlunos],
      );
      return resultado.rows;
    },

    async substituirParadasEMetricasDaRota({ routeId: idDaRota, userId: idDoUsuario, role: papel, stops: paradas, geometry: geometria, distanceKm: distanciaEmKm, durationMinutes: duracaoEmMinutos, fuelLiters: consumoEmLitros }) {
      if (!Array.isArray(paradas)) throw new TypeError('A lista de paradas precisa ser um vetor.');
      if (paradas.length > LIMITE_DE_ALUNOS_POR_ROTA) {
        const erro = new Error(`A rota aceita no máximo ${LIMITE_DE_ALUNOS_POR_ROTA} alunos.`);
        erro.statusCode = 400;
        throw erro;
      }
      const clienteDoBanco = await bancoDeDados.connect();
      try {
        await clienteDoBanco.query('BEGIN');
        const resultadoDaRota = await clienteDoBanco.query(
          `SELECT r.motorista_id AS "driverId", r.status, r.data_rota = CURRENT_DATE AS "isToday",
                  m.ativo AS "editorActive", m.role AS "editorRole"
             FROM rotas r JOIN motoristas m ON m.id = $2
            WHERE r.id = $1 FOR UPDATE OF r`,
          [idDaRota, idDoUsuario],
        );
        const rotaAtual = resultadoDaRota.rows[0];
        if (!rotaAtual) {
          const erro = new Error('Rota não encontrada.');
          erro.statusCode = 404;
          throw erro;
        }
        if (!rotaAtual.editorActive || rotaAtual.editorRole !== papel) {
          const erro = new Error('A conta não está mais ativa ou suas permissões foram alteradas.');
          erro.statusCode = 401;
          throw erro;
        }
        if (rotaAtual.status === 'concluida' || rotaAtual.status === 'cancelada') {
          const erro = new Error('Não é possível alterar uma rota concluída ou cancelada.');
          erro.statusCode = 409;
          throw erro;
        }
        if (papel !== 'admin' && (rotaAtual.driverId !== idDoUsuario || !rotaAtual.isToday)) {
          const erro = new Error('Motoristas só podem editar o próprio percurso do dia.');
          erro.statusCode = 403;
          throw erro;
        }

        await clienteDoBanco.query('DELETE FROM paradas_rota WHERE rota_id = $1', [idDaRota]);
        for (const [indice, parada] of paradas.entries()) {
          await clienteDoBanco.query(
            `INSERT INTO paradas_rota
              (rota_id, aluno_id, endereco_id, ordem_otimizada, status_parada, side_of_street)
             VALUES ($1, $2, $3, $4, $5, 'RIGHT')`,
            [idDaRota, parada.id, parada.addressId, indice + 1, parada.status ?? 'Aguardando'],
          );
        }
        await clienteDoBanco.query(
          `UPDATE rotas
              SET geometria_rota = ST_SetSRID(ST_GeomFromGeoJSON($2), 4326),
                  distancia_total_km = $3,
                  tempo_estimado_min = $4,
                  consumo_estimado_l = $5,
                  updated_at = now()
            WHERE id = $1`,
          [idDaRota, JSON.stringify(geometria), distanciaEmKm, duracaoEmMinutos, consumoEmLitros],
        );
        await clienteDoBanco.query('COMMIT');
      } catch (erro) {
        await clienteDoBanco.query('ROLLBACK').catch(() => {});
        throw erro;
      } finally {
        clienteDoBanco.release();
      }
    },

    async motoristaPodeAcessarRotas(idDoMotorista, idsDasRotas) {
      if (idsDasRotas.length === 0) return true;
      const resultado = await bancoDeDados.query(
        `SELECT r.id FROM rotas r
           JOIN motoristas m ON m.id = r.motorista_id AND m.ativo = true AND m.role = 'driver'
          WHERE r.motorista_id = $1 AND r.id = ANY($2::uuid[])`,
        [idDoMotorista, idsDasRotas],
      );
      return resultado.rowCount === new Set(idsDasRotas).size;
    },
  };
}
