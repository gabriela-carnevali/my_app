export function criarControladorAdministrativo({ adminService: servicoAdministrativo }) {
  return {
    async listarUsuarios(_requisicao, resposta, proximo) {
      try {
        resposta.json({ users: await servicoAdministrativo.listarUsuarios() });
      } catch (erro) {
        proximo(erro);
      }
    },

    async atualizarPermissoes(requisicao, resposta, proximo) {
      try {
        const usuario = await servicoAdministrativo.atualizarPermissoesDoUsuario({
          actorId: requisicao.user.id,
          userId: requisicao.params.id,
          role: requisicao.body?.role,
          active: requisicao.body?.active,
        });
        resposta.json({ user: usuario });
      } catch (erro) {
        proximo(erro);
      }
    },
  };
}
