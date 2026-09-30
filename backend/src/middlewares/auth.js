import { verificarTokenDeAcesso } from '../services/jwtService.js';

const PADRAO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function enviarErroDeAutenticacao(resposta, codigoHttp, mensagem) {
  resposta.status(codigoHttp).json({ message: mensagem });
}

export function autenticarMotorista(requisicao, resposta, proximo) {
  const segredoJwt = process.env.JWT_SECRET;
  if (!segredoJwt || Buffer.byteLength(segredoJwt, 'utf8') < 32) {
    return enviarErroDeAutenticacao(resposta, 503, 'Backend authentication is not configured. Set a JWT_SECRET of at least 32 bytes.');
  }

  const credencialDeAutenticacao = requisicao.get('authorization') ?? '';
  const correspondenciaDoToken = /^Bearer\s+([^\s]+)$/i.exec(credencialDeAutenticacao);
  if (!correspondenciaDoToken) return enviarErroDeAutenticacao(resposta, 401, 'A valid driver bearer token is required.');

  try {
    const dadosDoToken = verificarTokenDeAcesso(correspondenciaDoToken[1]);
    requisicao.user = { id: dadosDoToken.sub, role: dadosDoToken.role };
    return proximo();
  } catch {
    return enviarErroDeAutenticacao(resposta, 401, 'The driver bearer token is invalid or expired.');
  }
}

export function criarVerificacaoDePapel(bancoDeDados, ...papeisPermitidos) {
  return async function verificarPapelDoUsuario(requisicao, resposta, proximo) {
    try {
      const resultadoDaConsulta = await bancoDeDados.query('SELECT role, ativo AS conta_ativa FROM motoristas WHERE id = $1', [requisicao.user.id]);
      const contaDoUsuario = resultadoDaConsulta.rows[0];
      if (!contaDoUsuario?.conta_ativa || contaDoUsuario.role !== requisicao.user.role) {
        return enviarErroDeAutenticacao(resposta, 401, 'A conta foi desativada ou as permissões mudaram. Entre novamente.');
      }
      if (!papeisPermitidos.includes(contaDoUsuario.role)) {
        return enviarErroDeAutenticacao(resposta, 403, 'Você não tem permissão para esta operação.');
      }
      return proximo();
    } catch (erro) {
      return proximo(erro);
    }
  };
}

/* Sync events are intentionally limited to active, assigned drivers. */
export function exigirPapel(...papeisPermitidos) {
  return function verificarPapelDoUsuario(requisicao, resposta, proximo) {
    if (!papeisPermitidos.includes(requisicao.user?.role)) {
      return enviarErroDeAutenticacao(resposta, 403, 'Você não tem permissão para esta operação.');
    }
    return proximo();
  };
}

export function criarLimitadorDeTentativasDeLogin({ maxFailures: maximoDeFalhas = 5, windowMs: intervaloDeBloqueioMs = 15 * 60 * 1000 } = {}) {
  const faixasDeTentativas = new Map();

  function obterFaixaDeTentativas(chaveDaFaixa) {
    const instanteAtual = Date.now();
    if (faixasDeTentativas.size > 5000) {
      for (const [chaveArmazenada, faixaArmazenada] of faixasDeTentativas) {
        if (faixaArmazenada.limiteReiniciaEm <= instanteAtual) faixasDeTentativas.delete(chaveArmazenada);
      }
    }
    let faixaDeTentativas = faixasDeTentativas.get(chaveDaFaixa);
    if (!faixaDeTentativas || faixaDeTentativas.limiteReiniciaEm <= instanteAtual) {
      faixaDeTentativas = { quantidadeDeFalhas: 0, limiteReiniciaEm: instanteAtual + intervaloDeBloqueioMs };
      faixasDeTentativas.set(chaveDaFaixa, faixaDeTentativas);
    }
    return faixaDeTentativas;
  }

  return {
    verificarTentativas(requisicao, resposta, proximo) {
      const chaveDoCliente = requisicao.ip ?? requisicao.socket.remoteAddress ?? 'unknown';
      const faixaDeTentativas = obterFaixaDeTentativas(chaveDoCliente);
      if (faixaDeTentativas.quantidadeDeFalhas >= maximoDeFalhas) {
        resposta.set('Retry-After', String(Math.max(1, Math.ceil((faixaDeTentativas.limiteReiniciaEm - Date.now()) / 1000))));
        return enviarErroDeAutenticacao(resposta, 429, 'Muitas tentativas de login. Aguarde antes de tentar novamente.');
      }
      requisicao.chaveDeLimiteDeLogin = chaveDoCliente;
      return proximo();
    },
    registrarFalha(chaveDoCliente) {
      obterFaixaDeTentativas(chaveDoCliente ?? 'unknown').quantidadeDeFalhas += 1;
    },
    limparFalhas(chaveDoCliente) {
      faixasDeTentativas.delete(chaveDoCliente ?? 'unknown');
    },
  };
}

export function criarAutorizacaoDeRota(repositorioDeRotas) {
  return async function autorizarRota(requisicao, resposta, proximo) {
    try {
      if (!PADRAO_UUID.test(requisicao.params.id)) return enviarErroDeAutenticacao(resposta, 400, 'O identificador da rota deve ser um UUID.');
      if (!(await repositorioDeRotas.usuarioPodeAcessarRota(requisicao.user.id, requisicao.params.id, requisicao.user.role))) {
        return enviarErroDeAutenticacao(resposta, 404, 'Rota não encontrada para este motorista.');
      }
      return proximo();
    } catch (erro) {
      return proximo(erro);
    }
  };
}

export function criarAutorizacaoDeEventosDeSincronizacao(repositorioDeRotas) {
  return async function autorizarEventosDeSincronizacao(requisicao, resposta, proximo) {
    try {
      const eventosRecebidos = requisicao.body?.events;
      if (requisicao.user?.role !== 'driver') return enviarErroDeAutenticacao(resposta, 403, 'Somente motoristas podem sincronizar presenças e GPS.');
      if (!Array.isArray(eventosRecebidos)) return enviarErroDeAutenticacao(resposta, 400, 'events must be an array.');
      if (eventosRecebidos.length > 500) return enviarErroDeAutenticacao(resposta, 400, 'events must contain at most 500 items.');
      const idsDasRotas = eventosRecebidos.map((evento) => evento?.payload?.routeId);
      if (idsDasRotas.some((idDaRota) => typeof idDaRota !== 'string' || !PADRAO_UUID.test(idDaRota))) {
        return enviarErroDeAutenticacao(resposta, 400, 'Every event must include a valid route UUID.');
      }
      const idsUnicosDasRotas = [...new Set(idsDasRotas)];
      if (!(await repositorioDeRotas.motoristaPodeAcessarRotas(requisicao.user.id, idsUnicosDasRotas))) {
        return enviarErroDeAutenticacao(resposta, 403, 'O lote contém uma rota não atribuída a este motorista.');
      }
      return proximo();
    } catch (erro) {
      return proximo(erro);
    }
  };
}
