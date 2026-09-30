const PADRAO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function criarErroDeRequisicaoInvalida(mensagem) {
  const erro = new Error(mensagem);
  erro.statusCode = 400;
  return erro;
}

export function criarServicoAdministrativo({ adminRepository: repositorioAdministrativo }) {
  return {
    listarUsuarios() {
      return repositorioAdministrativo.listarUsuarios();
    },

    atualizarPermissoesDoUsuario({ actorId: idDoAdministrador, userId: idDoUsuario, role: papel, active: contaAtiva }) {
      if (!PADRAO_UUID.test(idDoUsuario)) throw criarErroDeRequisicaoInvalida('O identificador do usuário deve ser um UUID.');
      if (!['driver', 'admin'].includes(papel) || typeof contaAtiva !== 'boolean') {
        throw criarErroDeRequisicaoInvalida('Informe role como driver/admin e active como booleano.');
      }
      return repositorioAdministrativo.atualizarPermissoesDoUsuario({ actorId: idDoAdministrador, userId: idDoUsuario, role: papel, active: contaAtiva });
    },
  };
}
