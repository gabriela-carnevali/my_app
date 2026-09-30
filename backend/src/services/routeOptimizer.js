import { converterCoordenada, validarLadoDireitoDaCalcada } from './geoUtils.js';
import { LIMITE_DE_ALUNOS_POR_ROTA } from '../config/routeLimits.js';

const URL_BASE_DO_MAPBOX = 'https://api.mapbox.com';
const LIMITE_DE_COORDENADAS_DA_API_TRIP = 12;
const LIMITE_DE_COORDENADAS_DA_MATRIZ = 25;
const TAMANHO_DO_BLOCO_DA_MATRIZ = 12;

function obterCoordenadaDeLocalizacao(valor, descricao) {
  if (Array.isArray(valor)) return converterCoordenada(valor, descricao);
  if (!valor || typeof valor !== 'object') throw new TypeError(`${descricao} é obrigatória.`);
  const valorDaCoordenada = valor.coordinates
    ?? valor.coordinate
    ?? valor.location
    ?? valor.ponto_geog
    ?? valor.ponto_fachada
    ?? valor;
  return converterCoordenada(valorDaCoordenada, descricao);
}

function obterCoordenadaDaParada(aluno) {
  return obterCoordenadaDeLocalizacao(
    aluno.facadeCoordinates
      ?? aluno.coordinates
      ?? aluno.location
      ?? aluno.ponto_fachada
      ?? aluno.address?.facadeCoordinates
      ?? aluno.address?.ponto_fachada
      ?? aluno.endereco?.ponto_fachada
      ?? aluno.endereco
      ?? aluno.address,
    `fachada do aluno ${aluno.id ?? aluno.name ?? '(desconhecido)'}`,
  );
}

function validarLadoDaRuaDoAluno(aluno, coordenadasDaFachada) {
  const segmentoDaRua = aluno.streetSegment
    ?? aluno.address?.streetSegment
    ?? aluno.endereco?.streetSegment
    ?? aluno.endereco?.trecho_via
    ?? aluno.address?.trecho_via;
  const pontosDoTrecho = segmentoDaRua?.coordinates;
  const inicioDoTrecho = segmentoDaRua?.start ?? pontosDoTrecho?.[0];
  const fimDoTrecho = segmentoDaRua?.end ?? pontosDoTrecho?.[pontosDoTrecho.length - 1];
  if (!inicioDoTrecho || !fimDoTrecho) {
    throw new Error(
      `O aluno ${aluno.id ?? aluno.name ?? '(desconhecido)'} precisa informar início e fim orientados do trecho da rua para validar D < 0.`,
    );
  }
  const validacao = validarLadoDireitoDaCalcada({
    roadStart: inicioDoTrecho,
    roadEnd: fimDoTrecho,
    facade: coordenadasDaFachada,
    epsilon: Number(segmentoDaRua.epsilon ?? 0),
  });
  if (!validacao.valid) {
    throw new Error(
      `A fachada do aluno ${aluno.id ?? aluno.name ?? '(desconhecido)'} não está no lado direito validado do trecho orientado (D=${validacao.crossProduct.toFixed(2)}).`,
    );
  }
  return validacao;
}

function montarCaminhoDeCoordenadas(coordenadas) {
  return coordenadas.map(([longitude, latitude]) => `${longitude},${latitude}`).join(';');
}

function adicionarTokenAUrl(endereco, tokenDeAcesso) {
  endereco.searchParams.set('access_token', tokenDeAcesso);
  return endereco;
}

export function montarUrlDeOtimizacao({ coordinates: coordenadas, token: tokenDeAcesso, profile: perfil = 'mapbox/driving' }) {
  const endereco = new URL(`${URL_BASE_DO_MAPBOX}/optimized-trips/v1/${perfil}/${montarCaminhoDeCoordenadas(coordenadas)}`);
  endereco.searchParams.set('source', 'first');
  endereco.searchParams.set('destination', 'last');
  endereco.searchParams.set('roundtrip', 'false');
  endereco.searchParams.set('approaches', coordenadas.map(() => 'curb').join(';'));
  endereco.searchParams.set('steps', 'true');
  endereco.searchParams.set('geometries', 'geojson');
  endereco.searchParams.set('overview', 'full');
  endereco.searchParams.set('annotations', 'distance,duration');
  return adicionarTokenAUrl(endereco, tokenDeAcesso);
}

export function montarUrlDaMatriz({
  coordinates: coordenadas,
  token: tokenDeAcesso,
  profile: perfil = 'mapbox/driving',
  sources: indicesDeOrigens,
  destinations: indicesDeDestinos,
}) {
  const endereco = new URL(`${URL_BASE_DO_MAPBOX}/directions-matrix/v1/${perfil}/${montarCaminhoDeCoordenadas(coordenadas)}`);
  endereco.searchParams.set('annotations', 'distance,duration');
  endereco.searchParams.set('approaches', coordenadas.map(() => 'curb').join(';'));
  if (indicesDeOrigens) endereco.searchParams.set('sources', indicesDeOrigens.join(';'));
  if (indicesDeDestinos) endereco.searchParams.set('destinations', indicesDeDestinos.join(';'));
  return adicionarTokenAUrl(endereco, tokenDeAcesso);
}

function criarBlocosDeIndices(quantidade, tamanhoDoBloco) {
  const blocos = [];
  for (let inicio = 0; inicio < quantidade; inicio += tamanhoDoBloco) {
    blocos.push(Array.from({ length: Math.min(tamanhoDoBloco, quantidade - inicio) }, (_, deslocamento) => inicio + deslocamento));
  }
  return blocos;
}

async function buscarMatrizDeDistancias({ coordenadas, tokenDeAcesso, perfil, executarRequisicao }) {
  if (coordenadas.length <= LIMITE_DE_COORDENADAS_DA_MATRIZ) {
    return buscarJsonDaApi(
      executarRequisicao,
      montarUrlDaMatriz({ coordinates: coordenadas, token: tokenDeAcesso, profile: perfil }),
      'Mapbox Matrix API',
    );
  }

  const quantidadeDePontos = coordenadas.length;
  const distancias = Array.from({ length: quantidadeDePontos }, () => Array(quantidadeDePontos).fill(null));
  const duracoes = Array.from({ length: quantidadeDePontos }, () => Array(quantidadeDePontos).fill(null));
  const blocosDePontos = criarBlocosDeIndices(quantidadeDePontos, TAMANHO_DO_BLOCO_DA_MATRIZ);
  const requisicoesDeMatriz = [];

  for (const indicesDeOrigens of blocosDePontos) {
    for (const indicesDeDestinos of blocosDePontos) {
      const indicesDasCoordenadas = [...new Set([...indicesDeOrigens, ...indicesDeDestinos])];
      const posicoesLocais = new Map(indicesDasCoordenadas.map((indiceGlobal, indiceLocal) => [indiceGlobal, indiceLocal]));
      const respostaDaMatriz = buscarJsonDaApi(
        executarRequisicao,
        montarUrlDaMatriz({
          coordinates: indicesDasCoordenadas.map((indice) => coordenadas[indice]),
          token: tokenDeAcesso,
          profile: perfil,
          sources: indicesDeOrigens.map((indice) => posicoesLocais.get(indice)),
          destinations: indicesDeDestinos.map((indice) => posicoesLocais.get(indice)),
        }),
        'Mapbox Matrix API',
      );
      requisicoesDeMatriz.push({ indicesDeOrigens, indicesDeDestinos, respostaDaMatriz });
    }
  }

  const matrizesParciais = await Promise.all(requisicoesDeMatriz.map((requisicao) => requisicao.respostaDaMatriz));
  for (let indiceDoBloco = 0; indiceDoBloco < requisicoesDeMatriz.length; indiceDoBloco += 1) {
    const requisicao = requisicoesDeMatriz[indiceDoBloco];
    const matrizParcial = matrizesParciais[indiceDoBloco];
    if (!Array.isArray(matrizParcial.distances) || !Array.isArray(matrizParcial.durations)
      || matrizParcial.distances.length !== requisicao.indicesDeOrigens.length
      || matrizParcial.durations.length !== requisicao.indicesDeOrigens.length) {
      throw new Error('A API Matrix do Mapbox retornou um bloco com dimensões inesperadas.');
    }
    for (let indiceDaOrigem = 0; indiceDaOrigem < requisicao.indicesDeOrigens.length; indiceDaOrigem += 1) {
      const linhaDeDistancias = matrizParcial.distances[indiceDaOrigem];
      const linhaDeDuracoes = matrizParcial.durations[indiceDaOrigem];
      if (!Array.isArray(linhaDeDistancias) || !Array.isArray(linhaDeDuracoes)
        || linhaDeDistancias.length !== requisicao.indicesDeDestinos.length
        || linhaDeDuracoes.length !== requisicao.indicesDeDestinos.length) {
        throw new Error('A API Matrix do Mapbox retornou uma linha com dimensões inesperadas.');
      }
      for (let indiceDoDestino = 0; indiceDoDestino < requisicao.indicesDeDestinos.length; indiceDoDestino += 1) {
        const indiceGlobalDaOrigem = requisicao.indicesDeOrigens[indiceDaOrigem];
        const indiceGlobalDoDestino = requisicao.indicesDeDestinos[indiceDoDestino];
        distancias[indiceGlobalDaOrigem][indiceGlobalDoDestino] = linhaDeDistancias[indiceDoDestino];
        duracoes[indiceGlobalDaOrigem][indiceGlobalDoDestino] = linhaDeDuracoes[indiceDoDestino];
      }
    }
  }

  return { distances: distancias, durations: duracoes };
}

function objetivoEhMelhor(solucaoCandidata, melhorSolucaoAtual) {
  if (!melhorSolucaoAtual) return true;
  if (solucaoCandidata.distanciaEmMetros !== melhorSolucaoAtual.distanciaEmMetros) {
    return solucaoCandidata.distanciaEmMetros < melhorSolucaoAtual.distanciaEmMetros;
  }
  return solucaoCandidata.duracaoEmSegundos < melhorSolucaoAtual.duracaoEmSegundos;
}

function somarTrechoDaRota(trechoRestante, distanciaEmMetros, duracaoEmSegundos) {
  return {
    distanciaEmMetros: trechoRestante.distanciaEmMetros + distanciaEmMetros,
    duracaoEmSegundos: trechoRestante.duracaoEmSegundos + duracaoEmSegundos,
  };
}

function resolverPercursoAbertoAncorado(matrizDeDistancias, matrizDeDuracoes, indiceDoPrimeiroAluno) {
  const quantidadeDeAlunos = matrizDeDistancias.length - 2;
  const indiceDaEscolaNaMatriz = quantidadeDeAlunos + 1;
  if (quantidadeDeAlunos === 0) {
    const distanciaEmMetros = matrizDeDistancias[0][indiceDaEscolaNaMatriz];
    const duracaoEmSegundos = matrizDeDuracoes[0][indiceDaEscolaNaMatriz];
    if (distanciaEmMetros == null || duracaoEmSegundos == null) return null;
    return { indicesDosAlunos: [], distanciaEmMetros, duracaoEmSegundos };
  }

  const indicesDeAlunosRestantes = Array.from({ length: quantidadeDeAlunos }, (_, indice) => indice)
    .filter((indice) => indice !== indiceDoPrimeiroAluno);
  const solucoesMemorizadas = new Map();

  function visitarAluno(indiceDoAlunoAtual, mascaraDeAlunosRestantes) {
    const chaveDaSolucao = `${indiceDoAlunoAtual}:${mascaraDeAlunosRestantes}`;
    if (solucoesMemorizadas.has(chaveDaSolucao)) return solucoesMemorizadas.get(chaveDaSolucao);

    const indiceDoNoAtual = indiceDoAlunoAtual + 1;
    if (mascaraDeAlunosRestantes === 0) {
      const distanciaEmMetros = matrizDeDistancias[indiceDoNoAtual][indiceDaEscolaNaMatriz];
      const duracaoEmSegundos = matrizDeDuracoes[indiceDoNoAtual][indiceDaEscolaNaMatriz];
      const solucao = distanciaEmMetros == null || duracaoEmSegundos == null
        ? null
        : { indicesDosAlunos: [], distanciaEmMetros, duracaoEmSegundos };
      solucoesMemorizadas.set(chaveDaSolucao, solucao);
      return solucao;
    }

    let melhorSolucao = null;
    for (let indiceDoBit = 0; indiceDoBit < indicesDeAlunosRestantes.length; indiceDoBit += 1) {
      const mascaraDoBit = 1 << indiceDoBit;
      if ((mascaraDeAlunosRestantes & mascaraDoBit) === 0) continue;
      const indiceDoProximoAluno = indicesDeAlunosRestantes[indiceDoBit];
      const indiceDoProximoNo = indiceDoProximoAluno + 1;
      const distanciaDoTrecho = matrizDeDistancias[indiceDoNoAtual][indiceDoProximoNo];
      const duracaoDoTrecho = matrizDeDuracoes[indiceDoNoAtual][indiceDoProximoNo];
      if (distanciaDoTrecho == null || duracaoDoTrecho == null) continue;
      const trechoRestante = visitarAluno(indiceDoProximoAluno, mascaraDeAlunosRestantes ^ mascaraDoBit);
      if (!trechoRestante) continue;
      const solucaoCandidata = {
        indicesDosAlunos: [indiceDoProximoAluno, ...trechoRestante.indicesDosAlunos],
        ...somarTrechoDaRota(trechoRestante, distanciaDoTrecho, duracaoDoTrecho),
      };
      if (objetivoEhMelhor(solucaoCandidata, melhorSolucao)) melhorSolucao = solucaoCandidata;
    }

    solucoesMemorizadas.set(chaveDaSolucao, melhorSolucao);
    return melhorSolucao;
  }

  const indiceDoPrimeiroNo = indiceDoPrimeiroAluno + 1;
  const distanciaDeSaida = matrizDeDistancias[0][indiceDoPrimeiroNo];
  const duracaoDeSaida = matrizDeDuracoes[0][indiceDoPrimeiroNo];
  if (distanciaDeSaida == null || duracaoDeSaida == null) return null;
  const mascaraDeTodosOsAlunosRestantes = (1 << indicesDeAlunosRestantes.length) - 1;
  const trechoRestante = visitarAluno(indiceDoPrimeiroAluno, mascaraDeTodosOsAlunosRestantes);
  if (!trechoRestante) return null;
  return {
    indicesDosAlunos: [indiceDoPrimeiroAluno, ...trechoRestante.indicesDosAlunos],
    ...somarTrechoDaRota(trechoRestante, distanciaDeSaida, duracaoDeSaida),
  };
}

function calcularCustoDaSequencia(indicesDosAlunos, matrizDeDistancias, matrizDeDuracoes) {
  const indiceDaEscola = matrizDeDistancias.length - 1;
  let indiceDoPontoAtual = 0;
  let distanciaEmMetros = 0;
  let duracaoEmSegundos = 0;

  for (const indiceDoAluno of indicesDosAlunos) {
    const indiceDoProximoPonto = indiceDoAluno + 1;
    const distanciaDoTrecho = matrizDeDistancias[indiceDoPontoAtual]?.[indiceDoProximoPonto];
    const duracaoDoTrecho = matrizDeDuracoes[indiceDoPontoAtual]?.[indiceDoProximoPonto];
    if (distanciaDoTrecho == null || duracaoDoTrecho == null) return null;
    distanciaEmMetros += distanciaDoTrecho;
    duracaoEmSegundos += duracaoDoTrecho;
    indiceDoPontoAtual = indiceDoProximoPonto;
  }

  const distanciaAteAEscola = matrizDeDistancias[indiceDoPontoAtual]?.[indiceDaEscola];
  const duracaoAteAEscola = matrizDeDuracoes[indiceDoPontoAtual]?.[indiceDaEscola];
  if (distanciaAteAEscola == null || duracaoAteAEscola == null) return null;
  return {
    distanciaEmMetros: distanciaEmMetros + distanciaAteAEscola,
    duracaoEmSegundos: duracaoEmSegundos + duracaoAteAEscola,
  };
}

function construirPercursoPorInsercao(indiceDoPrimeiroAluno, quantidadeDeAlunos, matrizDeDistancias, matrizDeDuracoes) {
  let indicesDosAlunos = [indiceDoPrimeiroAluno];
  const indicesRestantes = new Set(Array.from({ length: quantidadeDeAlunos }, (_, indice) => indice)
    .filter((indice) => indice !== indiceDoPrimeiroAluno));

  while (indicesRestantes.size > 0) {
    let melhorInsercao = null;
    for (const indiceDoAluno of indicesRestantes) {
      for (let indiceDeInsercao = 1; indiceDeInsercao <= indicesDosAlunos.length; indiceDeInsercao += 1) {
        const novaSequencia = [...indicesDosAlunos];
        novaSequencia.splice(indiceDeInsercao, 0, indiceDoAluno);
        const custoDaSequencia = calcularCustoDaSequencia(novaSequencia, matrizDeDistancias, matrizDeDuracoes);
        if (custoDaSequencia && objetivoEhMelhor(custoDaSequencia, melhorInsercao?.custo)) {
          melhorInsercao = { indiceDoAluno, indicesDosAlunos: novaSequencia, custo: custoDaSequencia };
        }
      }
    }
    if (!melhorInsercao) return null;
    indicesDosAlunos = melhorInsercao.indicesDosAlunos;
    indicesRestantes.delete(melhorInsercao.indiceDoAluno);
  }

  return indicesDosAlunos;
}

function melhorarPercursoPorBuscaLocal(indicesIniciais, matrizDeDistancias, matrizDeDuracoes) {
  let indicesDosAlunos = [...indicesIniciais];
  let melhorCusto = calcularCustoDaSequencia(indicesDosAlunos, matrizDeDistancias, matrizDeDuracoes);
  if (!melhorCusto) return null;

  for (let iteracao = 0; iteracao < indicesDosAlunos.length * indicesDosAlunos.length; iteracao += 1) {
    let melhorCandidato = null;
    const avaliarCandidato = (sequencia) => {
      const custo = calcularCustoDaSequencia(sequencia, matrizDeDistancias, matrizDeDuracoes);
      if (custo && objetivoEhMelhor(custo, melhorCandidato?.custo)) melhorCandidato = { sequencia, custo };
    };

    for (let inicio = 1; inicio < indicesDosAlunos.length; inicio += 1) {
      for (let fim = inicio + 1; fim < indicesDosAlunos.length; fim += 1) {
        const sequenciaInvertida = [...indicesDosAlunos];
        sequenciaInvertida.splice(inicio, fim - inicio + 1, ...indicesDosAlunos.slice(inicio, fim + 1).reverse());
        avaliarCandidato(sequenciaInvertida);
      }
    }

    for (let indiceMovido = 1; indiceMovido < indicesDosAlunos.length; indiceMovido += 1) {
      const sequenciaSemAluno = indicesDosAlunos.filter((_, indice) => indice !== indiceMovido);
      for (let indiceDeInsercao = 1; indiceDeInsercao <= sequenciaSemAluno.length; indiceDeInsercao += 1) {
        const sequenciaReorganizada = [...sequenciaSemAluno];
        sequenciaReorganizada.splice(indiceDeInsercao, 0, indicesDosAlunos[indiceMovido]);
        avaliarCandidato(sequenciaReorganizada);
      }
    }

    if (!melhorCandidato || !objetivoEhMelhor(melhorCandidato.custo, melhorCusto)) break;
    indicesDosAlunos = melhorCandidato.sequencia;
    melhorCusto = melhorCandidato.custo;
  }

  return { indicesDosAlunos, ...melhorCusto };
}

async function buscarJsonDaApi(executarRequisicao, endereco, nomeDoServico) {
  const resposta = await executarRequisicao(endereco);
  let dadosDaResposta;
  try {
    dadosDaResposta = await resposta.json();
  } catch {
    throw new Error(`${nomeDoServico} retornou JSON inválido (HTTP ${resposta.status}).`);
  }
  if (!resposta.ok || dadosDaResposta.code !== 'Ok') {
    throw new Error(`${nomeDoServico} falhou: ${dadosDaResposta.message ?? dadosDaResposta.code ?? `HTTP ${resposta.status}`}.`);
  }
  return dadosDaResposta;
}

/**
 * Optimizes an open route with van and school as fixed endpoints. Distances
 * are the primary objective (fuel proxy); duration breaks exact distance ties.
 * Student coordinates use [longitude, latitude] and each student must include
 * an oriented streetSegment so the facade passes the strict D < 0 check.
 */
export async function otimizarRota({
  van: localizacaoDaVan,
  school: escola,
  students: alunos = [],
  token: tokenDeAcesso = process.env.MAPBOX_ACCESS_TOKEN,
  profile: perfil = 'mapbox/driving',
  vehicleConsumptionKmPerLiter: consumoDoVeiculoEmKmPorLitro,
  fetchImpl: executarRequisicao = globalThis.fetch,
}) {
  if (!tokenDeAcesso) throw new Error('Configure MAPBOX_ACCESS_TOKEN no servidor.');
  if (typeof executarRequisicao !== 'function') throw new TypeError('É necessário informar uma implementação da API Fetch.');
  if (!Array.isArray(alunos)) throw new TypeError('A lista de alunos precisa ser um vetor.');
  if (alunos.length > LIMITE_DE_ALUNOS_POR_ROTA) {
    throw new RangeError(`A rota aceita no máximo ${LIMITE_DE_ALUNOS_POR_ROTA} alunos.`);
  }

  const coordenadasDaVan = obterCoordenadaDeLocalizacao(localizacaoDaVan, 'localização da van');
  const coordenadasDaEscola = obterCoordenadaDeLocalizacao(escola, 'localização da escola');
  const alunosComCoordenadasValidadas = alunos.map((aluno, indice) => {
    if (!aluno || typeof aluno !== 'object') throw new TypeError(`O aluno na posição ${indice} precisa ser um objeto.`);
    const coordenadas = obterCoordenadaDaParada(aluno);
    const validacaoDaCalcada = validarLadoDaRuaDoAluno(aluno, coordenadas);
    return { ...aluno, coordinates: coordenadas, curbValidation: validacaoDaCalcada };
  });
  const coordenadasDeTodosOsPontos = [coordenadasDaVan, ...alunosComCoordenadasValidadas.map((aluno) => aluno.coordinates), coordenadasDaEscola];
  const requisicaoTrip = coordenadasDeTodosOsPontos.length <= LIMITE_DE_COORDENADAS_DA_API_TRIP
    ? buscarJsonDaApi(
      executarRequisicao,
      montarUrlDeOtimizacao({ coordinates: coordenadasDeTodosOsPontos, token: tokenDeAcesso, profile: perfil }),
      'Mapbox Optimization API',
    ).catch(() => null)
    : Promise.resolve(null);
  const [respostaDaOtimizacao, matrizDeDistancias] = await Promise.all([
    requisicaoTrip,
    buscarMatrizDeDistancias({
      coordenadas: coordenadasDeTodosOsPontos,
      tokenDeAcesso,
      perfil,
      executarRequisicao,
    }),
  ]);

  if (!Array.isArray(matrizDeDistancias.distances) || !Array.isArray(matrizDeDistancias.durations)) {
    throw new Error('A API Matrix do Mapbox não retornou as matrizes de distância e duração.');
  }
  if (matrizDeDistancias.distances.length !== coordenadasDeTodosOsPontos.length || matrizDeDistancias.durations.length !== coordenadasDeTodosOsPontos.length) {
    throw new Error('A API Matrix do Mapbox retornou uma matriz com quantidade inesperada de linhas.');
  }

  const candidatosAPrimeiraParada = [];
  for (let indice = 0; indice < alunosComCoordenadasValidadas.length; indice += 1) {
    const distancia = matrizDeDistancias.distances[0]?.[indice + 1];
    const duracao = matrizDeDistancias.durations[0]?.[indice + 1];
    if (distancia == null || duracao == null) continue;
    candidatosAPrimeiraParada.push({ indice, distanciaEmMetros: distancia, duracaoEmSegundos: duracao });
  }
  candidatosAPrimeiraParada.sort((candidatoEsquerdo, candidatoDireito) => (
    candidatoEsquerdo.distanciaEmMetros - candidatoDireito.distanciaEmMetros
    || candidatoEsquerdo.duracaoEmSegundos - candidatoDireito.duracaoEmSegundos
  ));
  if (alunosComCoordenadasValidadas.length > 0 && candidatosAPrimeiraParada.length === 0) {
    throw new Error('A van não consegue alcançar os alunos com uma aproximação compatível com a calçada.');
  }

  let indiceDoPrimeiroAluno = null;
  let solucaoDaRota = null;
  if (alunosComCoordenadasValidadas.length === 0) {
    solucaoDaRota = resolverPercursoAbertoAncorado(matrizDeDistancias.distances, matrizDeDistancias.durations, null);
  } else if (alunosComCoordenadasValidadas.length > LIMITE_DE_COORDENADAS_DA_API_TRIP - 2) {
    const candidatoMaisProximo = candidatosAPrimeiraParada[0];
    const sequenciaDeInsercao = construirPercursoPorInsercao(
      candidatoMaisProximo.indice,
      alunosComCoordenadasValidadas.length,
      matrizDeDistancias.distances,
      matrizDeDistancias.durations,
    );
    if (sequenciaDeInsercao) {
      indiceDoPrimeiroAluno = candidatoMaisProximo.indice;
      solucaoDaRota = melhorarPercursoPorBuscaLocal(
        sequenciaDeInsercao,
        matrizDeDistancias.distances,
        matrizDeDistancias.durations,
      );
    }
  } else {
    for (const candidato of candidatosAPrimeiraParada) {
      const solucaoCandidata = resolverPercursoAbertoAncorado(matrizDeDistancias.distances, matrizDeDistancias.durations, candidato.indice);
      if (solucaoCandidata) {
        indiceDoPrimeiroAluno = candidato.indice;
        solucaoDaRota = solucaoCandidata;
        break;
      }
    }
  }
  if (!solucaoDaRota) throw new Error('Não existe percurso compatível com a calçada que passe por todos os alunos e termine na escola.');
  const paradasOrdenadas = solucaoDaRota.indicesDosAlunos.map((indiceDoAluno, ordem) => {
    const aluno = alunosComCoordenadasValidadas[indiceDoAluno];
    return {
      ...aluno,
      order: ordem + 1,
      sideOfStreet: 'RIGHT',
      curbSideValidated: true,
    };
  });
  const indicesDeReferenciaDoMapbox = Array.isArray(respostaDaOtimizacao?.waypoints)
    ? respostaDaOtimizacao.waypoints
      .filter((pontoDePassagem) => pontoDePassagem.waypoint_index > 0 && pontoDePassagem.waypoint_index < coordenadasDeTodosOsPontos.length - 1)
      .sort((pontoEsquerdo, pontoDireito) => pontoEsquerdo.waypoint_index - pontoDireito.waypoint_index)
      .map((pontoDePassagem) => pontoDePassagem.waypoint_index - 1)
    : [];

  const distanciaEmQuilometros = solucaoDaRota.distanciaEmMetros / 1000;
  const consumoEmQuilometrosPorLitro = Number(consumoDoVeiculoEmKmPorLitro);
  return {
    origin: { type: 'van', coordinates: coordenadasDaVan },
    destination: { type: 'school', id: escola.id, coordinates: coordenadasDaEscola },
    firstStudent: paradasOrdenadas[0] ?? null,
    lastStudent: paradasOrdenadas[paradasOrdenadas.length - 1] ?? null,
    stops: paradasOrdenadas,
    totalDistanceMeters: solucaoDaRota.distanciaEmMetros,
    totalDistanceKm: distanciaEmQuilometros,
    estimatedDurationSeconds: solucaoDaRota.duracaoEmSegundos,
    estimatedFuelLiters: Number.isFinite(consumoEmQuilometrosPorLitro) && consumoEmQuilometrosPorLitro > 0
      ? distanciaEmQuilometros / consumoEmQuilometrosPorLitro
      : null,
    optimization: {
      provider: 'mapbox',
      method: alunosComCoordenadasValidadas.length > LIMITE_DE_COORDENADAS_DA_API_TRIP - 2
        ? 'insertion-and-local-search-open-path-over-mapbox-curb-matrix'
        : 'exact-open-path-over-mapbox-curb-matrix',
      primaryObjective: 'distance_meters',
      tieBreaker: 'duration_seconds',
      originFixed: true,
      destinationFixed: true,
      approaches: 'curb',
      mapboxTripBaselineStudentIndexes: indicesDeReferenciaDoMapbox,
    },
  };
}

export default otimizarRota;
