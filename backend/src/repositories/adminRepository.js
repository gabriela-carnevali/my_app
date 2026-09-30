export function criarRepositorioAdministrativo(bancoDeDados) {
  if (!bancoDeDados?.query || !bancoDeDados?.connect) throw new TypeError('É necessário configurar a conexão com o PostgreSQL.');

  return {
    async listarUsuarios() {
      const resultado = await bancoDeDados.query(
        `SELECT id, nome AS name, email, role, ativo AS active
           FROM motoristas
          ORDER BY nome`,
      );
      return resultado.rows;
    },

    async atualizarPermissoesDoUsuario({ actorId: idDoAdministrador, userId: idDoUsuario, role: perfil, active: contaAtiva }) {
      const clienteDoBanco = await bancoDeDados.connect();
      try {
        await clienteDoBanco.query('BEGIN');
        await clienteDoBanco.query(
          `SELECT id FROM motoristas
            WHERE role = 'admin' AND ativo = true
            ORDER BY id FOR UPDATE`,
        );
        const resultadoDoUsuarioAlvo = await clienteDoBanco.query(
          `SELECT id, role, ativo AS active FROM motoristas WHERE id = $1 FOR UPDATE`,
          [idDoUsuario],
        );
        const usuarioAlvo = resultadoDoUsuarioAlvo.rows[0];
        if (!usuarioAlvo) {
          const erro = new Error('Usuário não encontrado.');
          erro.statusCode = 404;
          throw erro;
        }
        if (idDoAdministrador === idDoUsuario && (perfil !== 'admin' || contaAtiva !== true)) {
          const erro = new Error('Não é possível remover a própria permissão de administrador ou desativar a própria conta.');
          erro.statusCode = 409;
          throw erro;
        }
        if (usuarioAlvo.role === 'admin' && usuarioAlvo.active && (perfil !== 'admin' || contaAtiva !== true)) {
          const administradoresRestantes = await clienteDoBanco.query(
            `SELECT COUNT(*)::int AS count FROM motoristas
              WHERE role = 'admin' AND ativo = true AND id <> $1`,
            [idDoUsuario],
          );
          if (administradoresRestantes.rows[0].count < 1) {
            const erro = new Error('O sistema precisa manter ao menos um administrador ativo.');
            erro.statusCode = 409;
            throw erro;
          }
        }
        const usuarioAtualizado = await clienteDoBanco.query(
          `UPDATE motoristas SET role = $2, ativo = $3, updated_at = now()
            WHERE id = $1
            RETURNING id, nome AS name, email, role, ativo AS active`,
          [idDoUsuario, perfil, contaAtiva],
        );
        await clienteDoBanco.query('COMMIT');
        return usuarioAtualizado.rows[0];
      } catch (erro) {
        await clienteDoBanco.query('ROLLBACK').catch(() => {});
        throw erro;
      } finally {
        clienteDoBanco.release();
      }
    },
  };
}
