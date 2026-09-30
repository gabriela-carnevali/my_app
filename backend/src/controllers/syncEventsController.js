export function criarControladorDeEventosDeSincronizacao({ syncEventService: servicoDeEventos }) {
  return {
    async criarLote(requisicao, resposta, proximo) {
      try {
        const idsAceitos = await servicoDeEventos.aceitarLote(requisicao.body?.events);
        resposta.json({ acceptedIds: idsAceitos });
      } catch (erro) {
        proximo(erro);
      }
    },
  };
}
