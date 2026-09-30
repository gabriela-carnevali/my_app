import { criarTokenDeAcesso } from './jwtService.js';
import { verificarSenha } from './passwordService.js';

function criarErroDeAcessoNegado() {
  const erro = new Error('E-mail ou senha incorretos.');
  erro.statusCode = 401;
  return erro;
}

export function criarServicoDeAutenticacao({ authRepository: repositorioDeAutenticacao }) {
  return {
    async autenticarUsuario(enderecoDeEmail, senha) {
      if (typeof enderecoDeEmail !== 'string' || enderecoDeEmail.trim().length < 3 || enderecoDeEmail.length > 254
        || typeof senha !== 'string' || senha.length < 1 || senha.length > 256) {
        const erro = new Error('Informe e-mail e senha válidos.');
        erro.statusCode = 400;
        throw erro;
      }

      const emailNormalizado = enderecoDeEmail.trim().toLowerCase();
      const motorista = await repositorioDeAutenticacao.buscarMotoristaAtivoPorEmail(emailNormalizado);
      const senhaConfere = await verificarSenha(senha, motorista?.passwordHash ?? null);
      if (!motorista || !senhaConfere) throw criarErroDeAcessoNegado();

      const tokenDeAcesso = criarTokenDeAcesso(motorista);
      return {
        ...tokenDeAcesso,
        tokenType: 'Bearer',
        driver: { id: motorista.id, name: motorista.name, email: motorista.email, role: motorista.role },
      };
    },

    async obterPerfilDoMotorista(idDoMotorista) {
      const motorista = await repositorioDeAutenticacao.buscarMotoristaAtivoPorId(idDoMotorista);
      if (!motorista) throw criarErroDeAcessoNegado();
      return motorista;
    },
  };
}
