import { createInterface } from 'node:readline/promises';
import { stdin as entradaPadrao, stdout as saidaPadrao } from 'node:process';
import bancoDeDados from '../config/database.js';
import { criarRepositorioDeAutenticacao } from '../repositories/authRepository.js';
import { gerarHashDaSenha } from '../services/passwordService.js';

function lerEntradaOculta(mensagem) {
  if (!entradaPadrao.isTTY || typeof entradaPadrao.setRawMode !== 'function') {
    return Promise.reject(new Error('Execute este comando em um terminal interativo para informar a senha com segurança.'));
  }

  saidaPadrao.write(mensagem);
  entradaPadrao.setRawMode(true);
  entradaPadrao.setEncoding('utf8');
  entradaPadrao.resume();

  return new Promise((resolver, rejeitar) => {
    let valorDigitado = '';
    const restaurarTerminal = () => {
      entradaPadrao.off('data', aoReceberDados);
      entradaPadrao.setRawMode(false);
      saidaPadrao.write('\n');
    };
    const aoReceberDados = (trechoDigitado) => {
      for (const caractere of trechoDigitado) {
        if (caractere === '\u0003') {
          restaurarTerminal();
          rejeitar(new Error('Operação cancelada.'));
          return;
        }
        if (caractere === '\r' || caractere === '\n') {
          restaurarTerminal();
          resolver(valorDigitado);
          return;
        }
        if (caractere === '\u007f' || caractere === '\b') {
          if (valorDigitado.length > 0) {
            valorDigitado = valorDigitado.slice(0, -1);
            saidaPadrao.write('\b \b');
          }
          continue;
        }
        if (caractere >= ' ') {
          valorDigitado += caractere;
          saidaPadrao.write('*');
        }
      }
    };
    entradaPadrao.on('data', aoReceberDados);
  });
}

async function executarCadastroDeSenha() {
  const perfilDoUsuario = process.argv.includes('--role=admin') ? 'admin' : null;
  const leitorDoTerminal = createInterface({ input: entradaPadrao, output: saidaPadrao });
  const enderecoDeEmail = (await leitorDoTerminal.question('E-mail do motorista: ')).trim().toLowerCase();
  leitorDoTerminal.close();
  const senha = await lerEntradaOculta('Nova senha (12 caracteres ou mais): ');
  const confirmacaoDaSenha = await lerEntradaOculta('Confirme a senha: ');
  if (senha !== confirmacaoDaSenha) throw new Error('As senhas não coincidem.');

  const hashDaSenha = await gerarHashDaSenha(senha);
  const repositorioDeAutenticacao = criarRepositorioDeAutenticacao(bancoDeDados);
  const motorista = await repositorioDeAutenticacao.definirSenhaDoMotoristaPorEmail(enderecoDeEmail, hashDaSenha, perfilDoUsuario);
  saidaPadrao.write(`Senha definida para usuário ${motorista.id}; perfil atual: ${motorista.role}.\n`);
}

try {
  await executarCadastroDeSenha();
} catch (erro) {
  console.error(erro.message);
  process.exitCode = 1;
} finally {
  await bancoDeDados.end();
}
