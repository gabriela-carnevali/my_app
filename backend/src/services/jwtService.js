import { createHmac, timingSafeEqual } from 'node:crypto';

const EMISSOR_DO_TOKEN = 'school-transport-api';
const DESTINATARIO_DO_TOKEN = 'school-transport-mobile';
const DURACAO_DO_TOKEN_EM_SEGUNDOS = 8 * 60 * 60;
const PADRAO_UUID_DO_MOTORISTA = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ErroDeTokenJwt extends Error {
  constructor(mensagem = 'Token inválido ou expirado.') {
    super(mensagem);
    this.name = 'ErroDeTokenJwt';
    this.statusCode = 401;
  }
}

export function obterSegredoJwt() {
  const segredo = process.env.JWT_SECRET;
  if (!segredo || Buffer.byteLength(segredo, 'utf8') < 32) {
    throw new Error('JWT_SECRET precisa ter pelo menos 32 bytes.');
  }
  return segredo;
}

function codificarJson(valor) {
  return Buffer.from(JSON.stringify(valor)).toString('base64url');
}

function decodificarJson(valor) {
  if (!/^[A-Za-z0-9_-]+$/.test(valor)) throw new ErroDeTokenJwt();
  return JSON.parse(Buffer.from(valor, 'base64url').toString('utf8'));
}

export function criarTokenDeAcesso(motorista, { now: instanteAtual = Date.now(), expiresInSeconds: validadeEmSegundos = DURACAO_DO_TOKEN_EM_SEGUNDOS } = {}) {
  if (!motorista?.id || !PADRAO_UUID_DO_MOTORISTA.test(motorista.id)) throw new TypeError('É necessário informar um UUID válido de motorista para criar o JWT.');
  if (!['driver', 'admin'].includes(motorista.role)) throw new TypeError('É necessário informar um perfil válido para criar o JWT.');
  const emitidoEmSegundos = Math.floor(instanteAtual / 1000);
  const dadosDoToken = {
    sub: motorista.id,
    role: motorista.role,
    iss: EMISSOR_DO_TOKEN,
    aud: DESTINATARIO_DO_TOKEN,
    iat: emitidoEmSegundos,
    exp: emitidoEmSegundos + validadeEmSegundos,
  };
  const cabecalhoDoToken = { alg: 'HS256', typ: 'JWT' };
  const conteudoParaAssinar = `${codificarJson(cabecalhoDoToken)}.${codificarJson(dadosDoToken)}`;
  const assinatura = createHmac('sha256', obterSegredoJwt()).update(conteudoParaAssinar).digest('base64url');
  return { accessToken: `${conteudoParaAssinar}.${assinatura}`, expiresAt: new Date(dadosDoToken.exp * 1000).toISOString() };
}

export function verificarTokenDeAcesso(token, { now: instanteAtual = Date.now() } = {}) {
  if (typeof token !== 'string' || token.length > 4096) throw new ErroDeTokenJwt();
  const partesDoToken = token.split('.');
  if (partesDoToken.length !== 3) throw new ErroDeTokenJwt();
  const [cabecalhoCodificado, dadosCodificados, assinaturaCodificada] = partesDoToken;

  try {
    const cabecalho = decodificarJson(cabecalhoCodificado);
    const dadosDoToken = decodificarJson(dadosCodificados);
    const assinaturaRecebida = Buffer.from(assinaturaCodificada, 'base64url');
    const assinaturaEsperada = createHmac('sha256', obterSegredoJwt())
      .update(`${cabecalhoCodificado}.${dadosCodificados}`)
      .digest();
    if (cabecalho.alg !== 'HS256' || cabecalho.typ !== 'JWT'
      || assinaturaRecebida.length !== assinaturaEsperada.length
      || !timingSafeEqual(assinaturaRecebida, assinaturaEsperada)) throw new ErroDeTokenJwt();

    const instanteAtualEmSegundos = Math.floor(instanteAtual / 1000);
    if (typeof dadosDoToken.sub !== 'string' || !PADRAO_UUID_DO_MOTORISTA.test(dadosDoToken.sub)
      || !['driver', 'admin'].includes(dadosDoToken.role)
      || dadosDoToken.iss !== EMISSOR_DO_TOKEN
      || dadosDoToken.aud !== DESTINATARIO_DO_TOKEN
      || !Number.isInteger(dadosDoToken.iat) || dadosDoToken.iat > instanteAtualEmSegundos + 60
      || !Number.isInteger(dadosDoToken.exp) || dadosDoToken.exp <= instanteAtualEmSegundos
      || (dadosDoToken.nbf != null && (!Number.isInteger(dadosDoToken.nbf) || dadosDoToken.nbf > instanteAtualEmSegundos + 30))) {
      throw new ErroDeTokenJwt();
    }
    return dadosDoToken;
  } catch (erro) {
    if (erro instanceof ErroDeTokenJwt) throw erro;
    throw new ErroDeTokenJwt();
  }
}
