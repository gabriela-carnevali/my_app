import express from 'express';
import { autenticarMotorista } from './middlewares/auth.js';
import { criarRoteadorAdministrativo } from './routes/adminRoutes.js';
import { criarRoteadorDeAutenticacao } from './routes/authRoutes.js';
import { criarRoteadorDeRotasDoMotorista } from './routes/driverRoutes.js';
import { criarRoteadorDeAlunos } from './routes/studentRoutes.js';
import { criarRoteadorDeEventosDeSincronizacao } from './routes/syncEvents.js';

export function criarAplicacaoDaApi({ pool: bancoDeDados }) {
  if (!bancoDeDados?.query || !bancoDeDados?.connect) throw new TypeError('É necessário configurar a conexão com o PostgreSQL.');

  const aplicacao = express();
  aplicacao.disable('x-powered-by');
  aplicacao.use(express.json({ limit: '1mb' }));
  aplicacao.get('/health', (_requisicao, resposta) => resposta.json({ status: 'ok' }));
  aplicacao.use('/api/auth', criarRoteadorDeAutenticacao({ pool: bancoDeDados }));
  aplicacao.use('/api/admin', criarRoteadorAdministrativo({ pool: bancoDeDados }));
  aplicacao.use('/api', criarRoteadorDeAlunos({ pool: bancoDeDados }));
  aplicacao.use('/api/routes', criarRoteadorDeRotasDoMotorista({ pool: bancoDeDados, authenticate: autenticarMotorista }));
  aplicacao.use('/api/sync/events', criarRoteadorDeEventosDeSincronizacao({ pool: bancoDeDados, authenticate: autenticarMotorista }));
  aplicacao.use((_requisicao, resposta) => resposta.status(404).json({ message: 'Endpoint não encontrado.' }));
  aplicacao.use((erro, _requisicao, resposta, _proximo) => {
    console.error('Request failed:', erro.message);
    resposta.status(erro.statusCode ?? 500).json({
      message: erro.statusCode ? erro.message : 'Erro interno do servidor.',
    });
  });
  return aplicacao;
}

export default criarAplicacaoDaApi;
