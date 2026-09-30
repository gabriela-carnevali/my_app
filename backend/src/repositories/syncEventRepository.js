export function criarRepositorioDeEventosDeSincronizacao(bancoDeDados) {
  if (!bancoDeDados?.connect) throw new TypeError('É necessário configurar a conexão com o PostgreSQL.');

  return {
    async armazenarLote(eventos) {
      const clienteDoBanco = await bancoDeDados.connect();
      try {
        await clienteDoBanco.query('BEGIN');
        const idsAceitos = [];

        for (const evento of eventos) {
          const insercaoDoEvento = await clienteDoBanco.query(
            `INSERT INTO sync_event_receipts
              (client_event_id, event_type, route_id, payload, client_created_at)
             VALUES ($1, $2, $3, $4::jsonb, $5)
             ON CONFLICT (client_event_id) DO NOTHING
             RETURNING client_event_id`,
            [evento.id, evento.type, evento.routeId, JSON.stringify(evento.payload), evento.createdAt],
          );

          if (insercaoDoEvento.rowCount === 0) {
            const comprovanteAnterior = await clienteDoBanco.query(
              `SELECT client_event_id FROM sync_event_receipts
                WHERE client_event_id = $1 AND event_type = $2 AND route_id = $3
                  AND payload = $4::jsonb`,
              [evento.id, evento.type, evento.routeId, JSON.stringify(evento.payload)],
            );
            if (comprovanteAnterior.rowCount === 0) {
              const erro = new Error('O identificador do evento já existe com dados diferentes.');
              erro.statusCode = 409;
              throw erro;
            }
            idsAceitos.push(evento.id);
            continue;
          }

          if (evento.type === 'attendance_status') {
            const atualizacaoDaParada = await clienteDoBanco.query(
              `UPDATE paradas_rota
                  SET status_parada = $3, registrado_em = $4, updated_at = now()
                WHERE rota_id = $1 AND aluno_id = $2
                RETURNING aluno_id`,
              [evento.routeId, evento.payload.studentId, evento.payload.status, evento.recordedAt],
            );
            if (atualizacaoDaParada.rowCount === 0) {
              const erro = new Error('Não existe uma parada para este aluno na rota informada.');
              erro.statusCode = 400;
              throw erro;
            }
            await clienteDoBanco.query(
              'UPDATE alunos SET status = $2, updated_at = now() WHERE id = $1',
              [evento.payload.studentId, evento.payload.status],
            );
          } else {
            await clienteDoBanco.query(
              `INSERT INTO gps_localizacoes
                (client_event_id, rota_id, ponto, precisao_m, altitude_m, direcao_graus, velocidade_m_s, registrado_em)
               VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326), $5, $6, $7, $8, $9)`,
              [
                evento.id,
                evento.routeId,
                evento.longitude,
                evento.latitude,
                evento.payload.accuracyMeters ?? null,
                evento.payload.altitudeMeters ?? null,
                evento.payload.headingDegrees ?? null,
                evento.payload.speedMetersPerSecond ?? null,
                evento.recordedAt,
              ],
            );
          }
          idsAceitos.push(evento.id);
        }

        await clienteDoBanco.query('COMMIT');
        return idsAceitos;
      } catch (erro) {
        await clienteDoBanco.query('ROLLBACK').catch(() => {});
        throw erro;
      } finally {
        clienteDoBanco.release();
      }
    },
  };
}
