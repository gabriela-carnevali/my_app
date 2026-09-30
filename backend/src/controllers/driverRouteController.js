export function criarControladorDaRotaDoMotorista({ routeService: servicoDeRotas }) {
  return {
    async listarRotas(requisicao, resposta, proximo) {
      try {
        resposta.json({ routes: await servicoDeRotas.listarRotasAcessiveis(requisicao.user) });
      } catch (erro) {
        proximo(erro);
      }
    },

    async obterPorId(requisicao, resposta, proximo) {
      try {
        const percurso = await servicoDeRotas.obterRotaDoMotorista(requisicao.params.id);
        if (!percurso) {
          resposta.status(404).json({ message: 'Rota não encontrada.' });
          return;
        }
        resposta.json({ route: percurso });
      } catch (erro) {
        proximo(erro);
      }
    },

    async obterAlunosElegiveis(requisicao, resposta, proximo) {
      try {
        const alunos = await servicoDeRotas.obterAlunosElegiveisDaRota(requisicao.params.id, requisicao.user);
        resposta.json({ students: alunos });
      } catch (erro) {
        proximo(erro);
      }
    },

    async atualizarParadas(requisicao, resposta, proximo) {
      try {
        const percurso = await servicoDeRotas.atualizarParadasDaRota({
          routeId: requisicao.params.id,
          user: requisicao.user,
          addStudentIds: requisicao.body?.addStudentIds ?? [],
          removeStudentIds: requisicao.body?.removeStudentIds ?? [],
        });
        resposta.json({ route: percurso });
      } catch (erro) {
        proximo(erro);
      }
    },
  };
}
