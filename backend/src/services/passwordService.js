import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const TAMANHO_DA_CHAVE = 64;
const OPCOES_DO_SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
let promessaDoHashFicticio;

function derivarChave(senha, sal, opcoes = OPCOES_DO_SCRYPT) {
  return new Promise((resolver, rejeitar) => {
    scrypt(senha, sal, TAMANHO_DA_CHAVE, opcoes, (erro, chaveDerivada) => {
      if (erro) rejeitar(erro);
      else resolver(chaveDerivada);
    });
  });
}

function decodificarBase64Url(valor) {
  if (typeof valor !== 'string' || !/^[A-Za-z0-9_-]+$/.test(valor)) return null;
  return Buffer.from(valor, 'base64url');
}

function interpretarHashDaSenha(valor) {
  if (typeof valor !== 'string') return null;
  const partesDoHash = valor.split('$');
  if (partesDoHash.length !== 6 || partesDoHash[0] !== 'scrypt'
    || partesDoHash[1] !== String(OPCOES_DO_SCRYPT.N)
    || partesDoHash[2] !== String(OPCOES_DO_SCRYPT.r)
    || partesDoHash[3] !== String(OPCOES_DO_SCRYPT.p)) return null;
  const sal = decodificarBase64Url(partesDoHash[4]);
  const chave = decodificarBase64Url(partesDoHash[5]);
  if (!sal || sal.length !== 16 || !chave || chave.length !== TAMANHO_DA_CHAVE) return null;
  return { salt: sal, key: chave };
}

export async function gerarHashDaSenha(senha) {
  if (typeof senha !== 'string' || senha.length < 12 || senha.length > 256) {
    throw new TypeError('A senha precisa ter entre 12 e 256 caracteres.');
  }
  const sal = randomBytes(16);
  const chave = await derivarChave(senha, sal);
  return `scrypt$${OPCOES_DO_SCRYPT.N}$${OPCOES_DO_SCRYPT.r}$${OPCOES_DO_SCRYPT.p}$${sal.toString('base64url')}$${chave.toString('base64url')}`;
}

async function obterHashFicticioDeSenha() {
  if (!promessaDoHashFicticio) {
    promessaDoHashFicticio = gerarHashDaSenha(randomBytes(32).toString('hex'));
  }
  return promessaDoHashFicticio;
}

export async function verificarSenha(senha, hashArmazenado) {
  if (typeof senha !== 'string' || senha.length > 256) return false;
  const hashParaVerificacao = interpretarHashDaSenha(hashArmazenado) ? hashArmazenado : await obterHashFicticioDeSenha();
  const hashInterpretado = interpretarHashDaSenha(hashParaVerificacao);
  const chaveCalculada = await derivarChave(senha, hashInterpretado.salt);
  const senhaConfere = timingSafeEqual(chaveCalculada, hashInterpretado.key);
  return Boolean(interpretarHashDaSenha(hashArmazenado)) && senhaConfere;
}
