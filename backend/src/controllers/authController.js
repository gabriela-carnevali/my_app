export function criarControladorDeAutenticacao({ authService: servicoDeAutenticacao, loginRateLimiter: limitadorDeTentativas }) {
  return {
    async entrarNaConta(requisicao, resposta, proximo) {
      try {
        const resultado = await servicoDeAutenticacao.autenticarUsuario(requisicao.body?.email, requisicao.body?.password);
        limitadorDeTentativas.limparFalhas(requisicao.chaveDeLimiteDeLogin);
        resposta.json(resultado);
      } catch (erro) {
        if (erro.statusCode === 401) limitadorDeTentativas.registrarFalha(requisicao.chaveDeLimiteDeLogin);
        proximo(erro);
      }
    },

    async obterPerfil(requisicao, resposta, proximo) {
      try {
        const motorista = await servicoDeAutenticacao.obterPerfilDoMotorista(requisicao.user.id);
        if (motorista.role !== requisicao.user.role) {
          resposta.status(401).json({ message: 'As permissões da conta mudaram. Entre novamente.' });
          return;
        }
        resposta.json({ driver: motorista });
      } catch (erro) {
        proximo(erro);
      }
    },
  };
}
