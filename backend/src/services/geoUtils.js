const RAIO_DA_TERRA_EM_METROS = 6371008.8;

function converterCoordenada(valor, descricao = 'coordenada') {
  const coordenadas = Array.isArray(valor)
    ? valor
    : valor && typeof valor === 'object'
      ? Array.isArray(valor.coordinates)
        ? valor.coordinates
        : [valor.longitude ?? valor.lon ?? valor.lng, valor.latitude ?? valor.lat]
      : null;

  if (!coordenadas || coordenadas.length < 2) {
    throw new TypeError(`${descricao} deve ser [longitude, latitude] ou { longitude, latitude }.`);
  }

  const converterNumero = (componente, nomeDaComponente) => {
    if ((typeof componente !== 'number' && typeof componente !== 'string')
      || (typeof componente === 'string' && componente.trim() === '')) {
      throw new TypeError(`${descricao} deve conter valores numéricos para ${nomeDaComponente}.`);
    }
    const numero = Number(componente);
    if (!Number.isFinite(numero)) {
      throw new TypeError(`${descricao} deve conter valores finitos de longitude e latitude.`);
    }
    return numero;
  };
  const longitude = converterNumero(coordenadas[0], 'longitude');
  const latitude = converterNumero(coordenadas[1], 'latitude');
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    throw new TypeError(`${descricao} deve conter valores finitos de longitude e latitude.`);
  }
  if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
    throw new RangeError(`${descricao} está fora dos limites válidos das coordenadas WGS84.`);
  }
  return [longitude, latitude];
}

function converterParaMetrosLocais(ponto, latitudeDeReferencia) {
  const [longitude, latitude] = converterCoordenada(ponto);
  const latitudeEmRadianos = (latitudeDeReferencia * Math.PI) / 180;
  return {
    x: RAIO_DA_TERRA_EM_METROS * ((longitude * Math.PI) / 180) * Math.cos(latitudeEmRadianos),
    y: RAIO_DA_TERRA_EM_METROS * ((latitude * Math.PI) / 180),
  };
}

/** Returns the signed 2D cross product in square meters. Positive is left, negative is right. */
export function calcularProdutoVetorial2D(inicioDoTrecho, fimDoTrecho, ponto) {
  const coordenadaInicial = converterCoordenada(inicioDoTrecho, 'início do trecho');
  const coordenadaFinal = converterCoordenada(fimDoTrecho, 'fim do trecho');
  const coordenadaDoPonto = converterCoordenada(ponto, 'ponto');
  const latitudeDeReferencia = (coordenadaInicial[1] + coordenadaFinal[1] + coordenadaDoPonto[1]) / 3;
  const pontoInicialEmMetros = converterParaMetrosLocais(coordenadaInicial, latitudeDeReferencia);
  const pontoFinalEmMetros = converterParaMetrosLocais(coordenadaFinal, latitudeDeReferencia);
  const localizacaoEmMetros = converterParaMetrosLocais(coordenadaDoPonto, latitudeDeReferencia);

  return (pontoFinalEmMetros.x - pontoInicialEmMetros.x) * (localizacaoEmMetros.y - pontoInicialEmMetros.y)
    - (pontoFinalEmMetros.y - pontoInicialEmMetros.y) * (localizacaoEmMetros.x - pontoInicialEmMetros.x);
}

/**
 * Validates the facade against an oriented road segment. The segment must point
 * in the permitted direction of travel; D < 0 means the facade is on the right.
 */
export function validarLadoDireitoDaCalcada({ roadStart: inicioDoTrecho, roadEnd: fimDoTrecho, facade: fachada, epsilon: tolerancia = 0 }) {
  if (typeof tolerancia !== 'number' || !Number.isFinite(tolerancia) || tolerancia < 0) {
    throw new RangeError('A tolerância do produto vetorial precisa ser um número finito não negativo.');
  }
  const produtoVetorial = calcularProdutoVetorial2D(inicioDoTrecho, fimDoTrecho, fachada);
  const ladoDaRua = produtoVetorial < -tolerancia
    ? 'RIGHT'
    : produtoVetorial > tolerancia
      ? 'LEFT'
      : 'ON_OR_TOO_CLOSE_TO_SEGMENT';

  return {
    valid: produtoVetorial < -tolerancia,
    side: ladoDaRua,
    crossProduct: produtoVetorial,
    rule: 'D < 0',
  };
}

export function estaNoLadoDireitoDaRua(inicioDoTrecho, fimDoTrecho, fachada, tolerancia = 0) {
  return validarLadoDireitoDaCalcada({ roadStart: inicioDoTrecho, roadEnd: fimDoTrecho, facade: fachada, epsilon: tolerancia }).valid;
}

/** Initial bearing from point A to B, in degrees clockwise from true north. */
export function calcularAzimute(coordenadaDeOrigem, coordenadaDeDestino) {
  const [longitudeInicial, latitudeInicial] = converterCoordenada(coordenadaDeOrigem, 'origem');
  const [longitudeFinal, latitudeFinal] = converterCoordenada(coordenadaDeDestino, 'destino');
  const latitudeInicialEmRadianos = (latitudeInicial * Math.PI) / 180;
  const latitudeFinalEmRadianos = (latitudeFinal * Math.PI) / 180;
  const diferencaDeLongitude = ((longitudeFinal - longitudeInicial) * Math.PI) / 180;
  const componenteY = Math.sin(diferencaDeLongitude) * Math.cos(latitudeFinalEmRadianos);
  const componenteX = Math.cos(latitudeInicialEmRadianos) * Math.sin(latitudeFinalEmRadianos)
    - Math.sin(latitudeInicialEmRadianos) * Math.cos(latitudeFinalEmRadianos) * Math.cos(diferencaDeLongitude);
  return (Math.atan2(componenteY, componenteX) * 180 / Math.PI + 360) % 360;
}

export function calcularDistanciaHaversineEmMetros(coordenadaDeOrigem, coordenadaDeDestino) {
  const [longitudeInicial, latitudeInicial] = converterCoordenada(coordenadaDeOrigem, 'origem');
  const [longitudeFinal, latitudeFinal] = converterCoordenada(coordenadaDeDestino, 'destino');
  const latitudeInicialEmRadianos = (latitudeInicial * Math.PI) / 180;
  const latitudeFinalEmRadianos = (latitudeFinal * Math.PI) / 180;
  const diferencaDeLatitude = latitudeFinalEmRadianos - latitudeInicialEmRadianos;
  const diferencaDeLongitude = ((longitudeFinal - longitudeInicial) * Math.PI) / 180;
  const haversine = Math.sin(diferencaDeLatitude / 2) ** 2
    + Math.cos(latitudeInicialEmRadianos) * Math.cos(latitudeFinalEmRadianos) * Math.sin(diferencaDeLongitude / 2) ** 2;
  return 2 * RAIO_DA_TERRA_EM_METROS * Math.asin(Math.sqrt(haversine));
}

export { converterCoordenada };
