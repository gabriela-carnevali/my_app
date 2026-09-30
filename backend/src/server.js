import { criarAplicacaoDaApi } from './app.js';
import bancoDeDados from './config/database.js';
import { obterSegredoJwt } from './services/jwtService.js';

obterSegredoJwt();
const porta = Number(process.env.PORT ?? 3000);
const aplicacao = criarAplicacaoDaApi({ pool: bancoDeDados });

const servidor = aplicacao.listen(porta, () => {
  console.log(`School transport API listening on port ${porta}.`);
});

async function encerrarServidor(sinal) {
  console.log(`${sinal} received; closing the API server.`);
  servidor.close(async () => {
    await bancoDeDados.end();
    process.exit(0);
  });
}

process.on('SIGINT', () => encerrarServidor('SIGINT'));
process.on('SIGTERM', () => encerrarServidor('SIGTERM'));

export { servidor };
