import express from 'express';
import { criarControladorDaRotaDoMotorista } from '../controllers/driverRouteController.js';
import { criarAutorizacaoDeRota, criarVerificacaoDePapel } from '../middlewares/auth.js';
import { criarRepositorioDeRotas } from '../repositories/routeRepository.js';
import { criarServicoDeRotas } from '../services/routeService.js';

export function criarRoteadorDeRotasDoMotorista({ pool: bancoDeDados, authenticate: autenticarRequisicao }) {
  const repositorioDeRotas = criarRepositorioDeRotas(bancoDeDados);
  const servicoDeRotas = criarServicoDeRotas({ routeRepository: repositorioDeRotas });
  const controlador = criarControladorDaRotaDoMotorista({ routeService: servicoDeRotas });
  const roteador = express.Router();
  const motoristasOuAdministradoresAtivos = criarVerificacaoDePapel(bancoDeDados, 'driver', 'admin');

  roteador.get('/', autenticarRequisicao, motoristasOuAdministradoresAtivos, controlador.listarRotas);
  roteador.get('/:id/candidates', autenticarRequisicao, criarAutorizacaoDeRota(repositorioDeRotas), controlador.obterAlunosElegiveis);
  roteador.put('/:id/stops', autenticarRequisicao, criarAutorizacaoDeRota(repositorioDeRotas), controlador.atualizarParadas);
  roteador.get('/:id', autenticarRequisicao, criarAutorizacaoDeRota(repositorioDeRotas), controlador.obterPorId);
  return roteador;
}

export default criarRoteadorDeRotasDoMotorista;
