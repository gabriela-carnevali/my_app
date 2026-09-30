import express from 'express';
import { criarControladorDeAutenticacao } from '../controllers/authController.js';
import { autenticarMotorista, criarLimitadorDeTentativasDeLogin } from '../middlewares/auth.js';
import { criarRepositorioDeAutenticacao } from '../repositories/authRepository.js';
import { criarServicoDeAutenticacao } from '../services/authService.js';

export function criarRoteadorDeAutenticacao({ pool: bancoDeDados }) {
  const repositorioDeAutenticacao = criarRepositorioDeAutenticacao(bancoDeDados);
  const servicoDeAutenticacao = criarServicoDeAutenticacao({ authRepository: repositorioDeAutenticacao });
  const limitadorDeTentativas = criarLimitadorDeTentativasDeLogin();
  const controlador = criarControladorDeAutenticacao({ authService: servicoDeAutenticacao, loginRateLimiter: limitadorDeTentativas });
  const roteador = express.Router();

  roteador.post('/login', limitadorDeTentativas.verificarTentativas, controlador.entrarNaConta);
  roteador.get('/me', autenticarMotorista, controlador.obterPerfil);
  return roteador;
}

export default criarRoteadorDeAutenticacao;
