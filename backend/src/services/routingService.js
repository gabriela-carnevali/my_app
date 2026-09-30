import { converterCoordenada } from './geoUtils.js';

const URL_BASE_DO_MAPBOX = 'https://api.mapbox.com';
const LIMITE_DE_COORDENADAS_DA_API_DIRECTIONS = 25;

function obterCoordenadas(valor, descricao) {
  if (Array.isArray(valor)) return converterCoordenada(valor, descricao);
  if (!valor || typeof valor !== 'object') throw new TypeError(`${descricao} é obrigatória.`);
  return converterCoordenada(
    valor.coordinates
      ?? valor.coordinate
      ?? valor.location
      ?? valor.ponto_geog
      ?? valor.ponto_fachada
      ?? valor,
    descricao,
  );
}

function codificarNumeroComSinal(valor) {
  let numeroCodificado = valor < 0 ? ~(valor << 1) : valor << 1;
  let resultadoCodificado = '';
  while (numeroCodificado >= 0x20) {
    resultadoCodificado += String.fromCharCode((0x20 | (numeroCodificado & 0x1f)) + 63);
    numeroCodificado = Math.floor(numeroCodificado / 32);
  }
  return resultadoCodificado + String.fromCharCode(numeroCodificado + 63);
}

export function codificarPolilinha6(coordenadas) {
  let latitudeAnterior = 0;
  let longitudeAnterior = 0;
  let polilinhaCodificada = '';
  for (const [longitude, latitude] of coordenadas) {
    const latitudeEmMilionesimos = Math.round(latitude * 1e6);
    const longitudeEmMilionesimos = Math.round(longitude * 1e6);
    polilinhaCodificada += codificarNumeroComSinal(latitudeEmMilionesimos - latitudeAnterior);
    polilinhaCodificada += codificarNumeroComSinal(longitudeEmMilionesimos - longitudeAnterior);
    latitudeAnterior = latitudeEmMilionesimos;
    longitudeAnterior = longitudeEmMilionesimos;
  }
  return polilinhaCodificada;
}

export function montarUrlDeDirecoes({ coordinates: coordenadas, token: tokenDeAcesso, profile: perfil = 'mapbox/driving' }) {
  if (coordenadas.length > LIMITE_DE_COORDENADAS_DA_API_DIRECTIONS) {
    throw new RangeError(`A API Directions aceita até ${LIMITE_DE_COORDENADAS_DA_API_DIRECTIONS} coordenadas por requisição.`);
  }
  const caminhoDeCoordenadas = coordenadas.map(([longitude, latitude]) => `${longitude},${latitude}`).join(';');
  const endereco = new URL(`${URL_BASE_DO_MAPBOX}/directions/v5/${perfil}/${caminhoDeCoordenadas}`);
  endereco.searchParams.set('approaches', ['', ...coordenadas.slice(1).map(() => 'curb')].join(';'));
  endereco.searchParams.set('steps', 'true');
  endereco.searchParams.set('geometries', 'geojson');
  endereco.searchParams.set('overview', 'full');
  endereco.searchParams.set('annotations', 'distance,duration');
  endereco.searchParams.set('access_token', tokenDeAcesso);
  return endereco;
}

async function buscarJsonDaApi(executarRequisicao, endereco) {
  const resposta = await executarRequisicao(endereco);
  let dadosDaResposta;
  try {
    dadosDaResposta = await resposta.json();
  } catch {
    throw new Error(`A API Directions do Mapbox retornou JSON inválido (HTTP ${resposta.status}).`);
  }
  if (!resposta.ok || dadosDaResposta.code !== 'Ok' || !dadosDaResposta.routes?.length) {
    throw new Error(`A API Directions do Mapbox falhou: ${dadosDaResposta.message ?? dadosDaResposta.code ?? `HTTP ${resposta.status}`}.`);
  }
  return dadosDaResposta.routes[0];
}

function dividirPercursoEmTrechos(coordenadas) {
  const trechos = [];
  let indiceInicial = 0;
  while (indiceInicial < coordenadas.length - 1) {
    const indiceFinal = Math.min(indiceInicial + LIMITE_DE_COORDENADAS_DA_API_DIRECTIONS, coordenadas.length);
    trechos.push(coordenadas.slice(indiceInicial, indiceFinal));
    indiceInicial = indiceFinal - 1;
  }
  return trechos;
}

/** Constrói a geometria com aproximação pela calçada para a sequência otimizada. */
export async function gerarGeometriaDaRota({
  van: localizacaoDaVan,
  school: escola,
  optimizedRoute: rotaOtimizada,
  token: tokenDeAcesso = process.env.MAPBOX_ACCESS_TOKEN,
  profile: perfil = 'mapbox/driving',
  fetchImpl: executarRequisicao = globalThis.fetch,
}) {
  if (!tokenDeAcesso) throw new Error('Configure MAPBOX_ACCESS_TOKEN no servidor.');
  if (typeof executarRequisicao !== 'function') throw new TypeError('É necessário informar uma implementação da API Fetch.');
  const paradas = Array.isArray(rotaOtimizada) ? rotaOtimizada : rotaOtimizada?.stops;
  if (!Array.isArray(paradas)) throw new TypeError('A rota otimizada precisa conter uma lista de paradas.');
  for (const [indice, parada] of paradas.entries()) {
    if (parada.sideOfStreet !== 'RIGHT' || parada.curbSideValidated !== true) {
      throw new Error(`A parada ${parada.id ?? indice + 1} não passou na validação obrigatória do lado direito.`);
    }
    if (parada.order != null && parada.order !== indice + 1) {
      throw new Error('As paradas precisam ser fornecidas na sequência otimizada começando pela ordem 1.');
    }
  }

  const coordenadasDoPercurso = [
    obterCoordenadas(localizacaoDaVan, 'localização da van'),
    ...paradas.map((parada, indice) => obterCoordenadas(parada, `localização da parada ${indice + 1}`)),
    obterCoordenadas(escola, 'localização da escola'),
  ];
  const rotasDosTrechos = await Promise.all(dividirPercursoEmTrechos(coordenadasDoPercurso).map((coordenadasDoTrecho) => (
    buscarJsonDaApi(
      executarRequisicao,
      montarUrlDeDirecoes({ coordinates: coordenadasDoTrecho, token: tokenDeAcesso, profile: perfil }),
    )
  )));
  const coordenadasDoTrajeto = [];
  for (const rotaDoTrecho of rotasDosTrechos) {
    const coordenadasDoTrecho = rotaDoTrecho.geometry?.coordinates;
    if (!Array.isArray(coordenadasDoTrecho) || coordenadasDoTrecho.length < 2) {
      throw new Error('A API Directions do Mapbox não retornou uma geometria LineString utilizável.');
    }
    const coordenadasIniciais = coordenadasDoTrajeto.at(-1)?.[0] === coordenadasDoTrecho[0][0]
      && coordenadasDoTrajeto.at(-1)?.[1] === coordenadasDoTrecho[0][1]
      ? coordenadasDoTrecho.slice(1)
      : coordenadasDoTrecho;
    coordenadasDoTrajeto.push(...coordenadasIniciais);
  }

  const distanciaTotalEmMetros = rotasDosTrechos.reduce((soma, rotaDoTrecho) => soma + rotaDoTrecho.distance, 0);
  const duracaoTotalEmSegundos = rotasDosTrechos.reduce((soma, rotaDoTrecho) => soma + rotaDoTrecho.duration, 0);

  return {
    geometry: { type: 'LineString', coordinates: coordenadasDoTrajeto },
    polyline: codificarPolilinha6(coordenadasDoTrajeto),
    polylinePrecision: 6,
    distanceMeters: distanciaTotalEmMetros,
    durationSeconds: duracaoTotalEmSegundos,
    legs: rotasDosTrechos.flatMap((rotaDoTrecho) => rotaDoTrecho.legs ?? []),
    waypoints: rotasDosTrechos.flatMap((rotaDoTrecho) => rotaDoTrecho.waypoints ?? []),
    curbApproachApplied: true,
    sideOfStreet: 'RIGHT',
  };
}

export default gerarGeometriaDaRota;
