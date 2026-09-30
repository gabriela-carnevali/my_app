export function criarRepositorioDeAutenticacao(bancoDeDados) {
  if (!bancoDeDados?.query || !bancoDeDados?.connect) throw new TypeError('É necessário configurar a conexão com o PostgreSQL.');

  return {
    async buscarMotoristaAtivoPorEmail(enderecoDeEmail) {
      const resultado = await bancoDeDados.query(
        `SELECT id, nome AS name, email, senha_hash AS "passwordHash", role
           FROM motoristas
          WHERE ativo = true AND lower(email) = lower($1)
          LIMIT 2`,
        [enderecoDeEmail],
      );
      return resultado.rowCount === 1 ? resultado.rows[0] : null;
    },

    async buscarMotoristaAtivoPorId(idDoMotorista) {
      const resultado = await bancoDeDados.query(
        `SELECT id, nome AS name, email, role
           FROM motoristas
          WHERE id = $1 AND ativo = true`,
        [idDoMotorista],
      );
      return resultado.rows[0] ?? null;
    },

    async definirSenhaDoMotoristaPorEmail(enderecoDeEmail, hashDaSenha, perfil = null) {
      if (perfil != null && !['driver', 'admin'].includes(perfil)) throw new TypeError('O perfil precisa ser driver ou admin.');
      const clienteDoBanco = await bancoDeDados.connect();
      try {
        await clienteDoBanco.query('BEGIN');
        const motoristasEncontrados = await clienteDoBanco.query(
          `SELECT id FROM motoristas
            WHERE ativo = true AND lower(email) = lower($1)
            FOR UPDATE`,
          [enderecoDeEmail],
        );
        if (motoristasEncontrados.rowCount !== 1) {
          const erro = new Error(motoristasEncontrados.rowCount === 0
            ? 'Motorista ativo não encontrado para esse e-mail.'
            : 'Há mais de um motorista ativo com esse e-mail. Corrija os dados antes de cadastrar a senha.');
          erro.statusCode = motoristasEncontrados.rowCount === 0 ? 404 : 409;
          throw erro;
        }
        const resultado = await clienteDoBanco.query(
          `UPDATE motoristas SET senha_hash = $2, role = COALESCE($3, role), updated_at = now()
            WHERE id = $1
            RETURNING id, role`,
          [motoristasEncontrados.rows[0].id, hashDaSenha, perfil],
        );
        await clienteDoBanco.query('COMMIT');
        return resultado.rows[0];
      } catch (erro) {
        await clienteDoBanco.query('ROLLBACK').catch(() => {});
        throw erro;
      } finally {
        clienteDoBanco.release();
      }
    },
  };
}
