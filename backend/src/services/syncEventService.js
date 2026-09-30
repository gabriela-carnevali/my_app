import { converterCoordenada } from "./geoUtils.js";

const STATUS_DE_PRESENCA_VALIDOS = new Set([
  "Aguardando",
  "Embarcado",
  "Ausente",
  "Desembarcado",
]);
const PADRAO_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function criarErroDeRequisicaoInvalida(mensagem) {
  const erro = new Error(mensagem);
  erro.statusCode = 400;
  return erro;
}

function exigirUuidValido(valor, nomeDoCampo) {
  if (typeof valor !== "string" || !PADRAO_UUID.test(valor)) {
    throw criarErroDeRequisicaoInvalida(
      `${nomeDoCampo} precisa ser um UUID válido.`,
    );
  }
  return valor;
}

function exigirDataValida(valor, nomeDoCampo) {
  const dataValidada = new Date(valor);
  if (!valor || Number.isNaN(dataValidada.getTime())) {
    throw criarErroDeRequisicaoInvalida(
      `${nomeDoCampo} precisa conter uma data válida.`,
    );
  }
  return dataValidada.toISOString();
}

function validarMedidaGps(valor, nomeDoCampo, minimo, maximo) {
  if (valor == null) return null;
  if (
    typeof valor !== "number" ||
    !Number.isFinite(valor) ||
    valor < minimo ||
    valor > maximo
  ) {
    throw criarErroDeRequisicaoInvalida(
      `${nomeDoCampo} precisa ser um número válido entre ${minimo} e ${maximo}.`,
    );
  }
  return valor;
}

function validarEvento(evento) {
  if (!evento || typeof evento !== "object")
    throw criarErroDeRequisicaoInvalida("Cada evento precisa ser um objeto.");
  if (
    typeof evento.id !== "string" ||
    evento.id.length < 1 ||
    evento.id.length > 128
  ) {
    throw criarErroDeRequisicaoInvalida(
      "Cada evento precisa ter um identificador entre 1 e 128 caracteres.",
    );
  }
  if (!["attendance_status", "gps_location"].includes(evento.type)) {
    throw criarErroDeRequisicaoInvalida(
      `Tipo de evento não aceito: ${evento.type}.`,
    );
  }
  if (
    !evento.payload ||
    typeof evento.payload !== "object" ||
    Array.isArray(evento.payload)
  ) {
    throw criarErroDeRequisicaoInvalida(
      "Cada evento precisa conter um objeto de dados.",
    );
  }
  const idDaRota = exigirUuidValido(evento.payload.routeId, "payload.routeId");
  const dataDeCriacao = exigirDataValida(evento.createdAt, "createdAt");
  const dataDeRegistro = exigirDataValida(
    evento.payload.recordedAt,
    "payload.recordedAt",
  );

  if (evento.type === "attendance_status") {
    exigirUuidValido(evento.payload.studentId, "payload.studentId");
    if (!STATUS_DE_PRESENCA_VALIDOS.has(evento.payload.status)) {
      throw criarErroDeRequisicaoInvalida("O status de presença não é válido.");
    }
    return {
      ...evento,
      routeId: idDaRota,
      createdAt: dataDeCriacao,
      recordedAt: dataDeRegistro,
    };
  }

  const coordenadas = evento.payload.coordinates;
  if (!Array.isArray(coordenadas) || coordenadas.length !== 2) {
    throw criarErroDeRequisicaoInvalida(
      "As coordenadas GPS precisam estar no formato [longitude, latitude].",
    );
  }
  let coordenadasValidadas;
  try {
    coordenadasValidadas = converterCoordenada(coordenadas, "coordenadas GPS");
  } catch {
    throw criarErroDeRequisicaoInvalida(
      "As coordenadas GPS estão fora dos limites WGS84 válidos.",
    );
  }
  const [longitude, latitude] = coordenadasValidadas;
  const precisaoEmMetros = validarMedidaGps(
    evento.payload.accuracyMeters,
    "payload.accuracyMeters",
    0,
    999999.99,
  );
  const altitudeEmMetros = validarMedidaGps(
    evento.payload.altitudeMeters,
    "payload.altitudeMeters",
    -9999999.99,
    9999999.99,
  );
  const direcaoEmGraus = validarMedidaGps(
    evento.payload.headingDegrees,
    "payload.headingDegrees",
    0,
    360,
  );
  const velocidadeEmMetrosPorSegundo = validarMedidaGps(
    evento.payload.speedMetersPerSecond,
    "payload.speedMetersPerSecond",
    0,
    99999.999,
  );
  return {
    ...evento,
    payload: {
      ...evento.payload,
      accuracyMeters: precisaoEmMetros,
      altitudeMeters: altitudeEmMetros,
      headingDegrees: direcaoEmGraus,
      speedMetersPerSecond: velocidadeEmMetrosPorSegundo,
    },
    routeId: idDaRota,
    createdAt: dataDeCriacao,
    recordedAt: dataDeRegistro,
    longitude,
    latitude,
  };
}

export function criarServicoDeEventosDeSincronizacao({
  syncEventRepository: repositorioDeEventos,
}) {
  return {
    async aceitarLote(eventosRecebidos) {
      if (!Array.isArray(eventosRecebidos) || eventosRecebidos.length > 500) {
        throw criarErroDeRequisicaoInvalida("Envie até 500 eventos por lote.");
      }
      const eventosValidados = eventosRecebidos.map(validarEvento);
      return repositorioDeEventos.armazenarLote(eventosValidados);
    },
  };
}
