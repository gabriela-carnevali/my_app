import express from 'express';
import { criarControladorDeEventosDeSincronizacao } from '../controllers/syncEventsController.js';
import { criarAutorizacaoDeEventosDeSincronizacao } from '../middlewares/auth.js';
import { criarRepositorioDeRotas } from '../repositories/routeRepository.js';
import { criarRepositorioDeEventosDeSincronizacao } from '../repositories/syncEventRepository.js';
import { criarServicoDeEventosDeSincronizacao } from '../services/syncEventService.js';

export function criarRoteadorDeEventosDeSincronizacao({ pool: bancoDeDados, authenticate: autenticarRequisicao }) {
  const repositorioDeRotas = criarRepositorioDeRotas(bancoDeDados);
  const repositorioDeEventos = criarRepositorioDeEventosDeSincronizacao(bancoDeDados);
  const servicoDeEventos = criarServicoDeEventosDeSincronizacao({ syncEventRepository: repositorioDeEventos });
  const controlador = criarControladorDeEventosDeSincronizacao({ syncEventService: servicoDeEventos });
  const roteador = express.Router();

  roteador.post('/', autenticarRequisicao, criarAutorizacaoDeEventosDeSincronizacao(repositorioDeRotas), controlador.criarLote);
  return roteador;
}

export default criarRoteadorDeEventosDeSincronizacao;
