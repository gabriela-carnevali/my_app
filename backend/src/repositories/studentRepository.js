export function criarRepositorioDeAlunos(bancoDeDados) {
  if (!bancoDeDados?.query || !bancoDeDados?.connect) throw new TypeError('É necessário configurar a conexão com o PostgreSQL.');

  return {
    async listarEscolas() {
      const resultado = await bancoDeDados.query('SELECT id, nome AS name FROM escolas ORDER BY nome');
      return resultado.rows;
    },

    async escolaExiste(idDaEscola) {
      const resultado = await bancoDeDados.query('SELECT 1 FROM escolas WHERE id = $1', [idDaEscola]);
      return resultado.rowCount > 0;
    },

    async criarAlunoComEndereco(aluno) {
      const clienteDoBanco = await bancoDeDados.connect();
      try {
        await clienteDoBanco.query('BEGIN');
        const resultadoDoCadastro = await clienteDoBanco.query(
          `INSERT INTO alunos (escola_id, nome, foto_url)
           VALUES ($1, $2, $3)
           RETURNING id, nome AS name, foto_url AS "photoUrl", status`,
          [aluno.schoolId, aluno.name, aluno.photoUrl],
        );
        const registroDoAluno = resultadoDoCadastro.rows[0];
        const resultadoDoEndereco = await clienteDoBanco.query(
          `INSERT INTO enderecos
            (aluno_id, ponto_fachada, ponto_via, trecho_via, logradouro, numero, complemento, principal, ativo)
           VALUES (
             $1,
             ST_SetSRID(ST_MakePoint($2, $3), 4326),
             ST_LineInterpolatePoint(ST_SetSRID(ST_MakeLine(ST_MakePoint($4, $5), ST_MakePoint($6, $7)), 4326), 0.5),
             ST_SetSRID(ST_MakeLine(ST_MakePoint($4, $5), ST_MakePoint($6, $7)), 4326),
             $8, $9, $10, true, true
           )
           RETURNING id`,
          [
            registroDoAluno.id,
            aluno.facadeCoordinates[0], aluno.facadeCoordinates[1],
            aluno.roadStartCoordinates[0], aluno.roadStartCoordinates[1],
            aluno.roadEndCoordinates[0], aluno.roadEndCoordinates[1],
            aluno.street, aluno.number, aluno.complement,
          ],
        );
        await clienteDoBanco.query('COMMIT');
        return {
          ...registroDoAluno,
          addressId: resultadoDoEndereco.rows[0].id,
          sideOfStreet: 'RIGHT',
          coordinates: aluno.facadeCoordinates,
          streetSegment: { start: aluno.roadStartCoordinates, end: aluno.roadEndCoordinates },
          address: { label: [aluno.street, aluno.number, aluno.complement].filter(Boolean).join(', ') },
        };
      } catch (erro) {
        await clienteDoBanco.query('ROLLBACK').catch(() => {});
        throw erro;
      } finally {
        clienteDoBanco.release();
      }
    },
  };
}
