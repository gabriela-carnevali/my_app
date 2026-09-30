import { validarLadoDireitoDaCalcada } from './geoUtils.js';
import { otimizarRota } from './routeOptimizer.js';
import { gerarGeometriaDaRota } from './routingService.js';

const PADRAO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LIMITE_DE_ALUNOS_POR_ROTA = 27;

function criarErroHttp(codigoHttp, mensagem) {
  const erro = new Error(mensagem);
  erro.statusCode = codigoHttp;
  return erro;
}

export function criarServicoDeRotas({
  routeRepository: repositorioDeRotas,
  directionsService: servicoDeDirecoes = gerarGeometriaDaRota,
  optimizer: otimizador = otimizarRota,
}) {
  async function obterRotaEditavel(idDaRota, usuario) {
    const contextoDaRota = await repositorioDeRotas.buscarContextoDeEdicaoDaRota(idDaRota);
    if (!contextoDaRota) throw criarErroHttp(404, 'Rota não encontrada.');
    if (contextoDaRota.status === 'concluida' || contextoDaRota.status === 'cancelada') {
      throw criarErroHttp(409, 'Não é possível editar uma rota concluída ou cancelada.');
    }
    if (usuario.role !== 'admin' && (contextoDaRota.driverId !== usuario.id || !contextoDaRota.isToday)) {
      throw criarErroHttp(403, 'Motoristas só podem editar o próprio percurso do dia.');
    }
    return contextoDaRota;
  }

  return {
    listarRotasAcessiveis(usuario) {
      return repositorioDeRotas.listarRotasAcessiveis(usuario.id, usuario.role);
    },

    async obterRotaDoMotorista(idDaRota) {
      const percurso = await repositorioDeRotas.buscarRotaDoMotoristaPorId(idDaRota);
      if (!percurso) return null;

      for (const parada of percurso.stops) {
        const validacaoDaCalcada = validarLadoDireitoDaCalcada({
          roadStart: parada.streetSegment.start,
          roadEnd: parada.streetSegment.end,
          facade: parada.coordinates,
        });
        if (parada.sideOfStreet !== 'RIGHT' || !validacaoDaCalcada.valid) {
          throw criarErroHttp(409, `A parada ${parada.id} não passou na validação do lado direito da rua.`);
        }
        parada.curbSideValidated = true;
      }

      if (!percurso.geometry && process.env.MAPBOX_ACCESS_TOKEN) {
        const geometriaDoPercurso = await servicoDeDirecoes({
          van: percurso.origin.coordinates,
          school: percurso.destination,
          optimizedRoute: percurso,
        });
        percurso.geometry = geometriaDoPercurso.geometry;
        percurso.distanceKm = geometriaDoPercurso.distanceMeters / 1000;
        percurso.estimatedDurationMinutes = geometriaDoPercurso.durationSeconds / 60;
        percurso.estimatedFuelLiters = Number(percurso.vehicleConsumptionKmPerLiter) > 0
          ? percurso.distanceKm / Number(percurso.vehicleConsumptionKmPerLiter)
          : null;
        await repositorioDeRotas.salvarGeometriaDaRota({
          routeId: percurso.id,
          geometry: percurso.geometry,
          distanceKm: percurso.distanceKm,
          durationMinutes: percurso.estimatedDurationMinutes,
          fuelLiters: percurso.estimatedFuelLiters,
        });
      }
      return percurso;
    },

    async obterAlunosElegiveisDaRota(idDaRota, usuario) {
      await obterRotaEditavel(idDaRota, usuario);
      return repositorioDeRotas.buscarAlunosElegiveisDaRota(idDaRota);
    },

    async atualizarParadasDaRota({ routeId: idDaRota, user: usuario, addStudentIds: idsDosAlunosParaAdicionar = [], removeStudentIds: idsDosAlunosParaRemover = [] }) {
      const contextoDaRota = await obterRotaEditavel(idDaRota, usuario);
      if (!Array.isArray(idsDosAlunosParaAdicionar) || !Array.isArray(idsDosAlunosParaRemover)) {
        throw criarErroHttp(400, 'addStudentIds e removeStudentIds precisam ser listas.');
      }
      const todosOsIds = [...idsDosAlunosParaAdicionar, ...idsDosAlunosParaRemover];
      if (todosOsIds.some((idDoAluno) => typeof idDoAluno !== 'string' || !PADRAO_UUID.test(idDoAluno))) {
        throw criarErroHttp(400, 'Todos os alunos precisam ter identificadores UUID válidos.');
      }
      if (new Set(idsDosAlunosParaAdicionar).size !== idsDosAlunosParaAdicionar.length
        || new Set(idsDosAlunosParaRemover).size !== idsDosAlunosParaRemover.length
        || idsDosAlunosParaAdicionar.some((idDoAluno) => idsDosAlunosParaRemover.includes(idDoAluno))) {
        throw criarErroHttp(400, 'A lista de alunos contém identificadores repetidos ou conflitantes.');
      }

      const alunosAtuaisPorId = new Map(contextoDaRota.stops.map((parada) => [parada.id, parada]));
      if (idsDosAlunosParaRemover.some((idDoAluno) => !alunosAtuaisPorId.has(idDoAluno))) {
        throw criarErroHttp(400, 'Só é possível retirar alunos que já estejam neste percurso.');
      }
      if (idsDosAlunosParaAdicionar.some((idDoAluno) => alunosAtuaisPorId.has(idDoAluno))) {
        throw criarErroHttp(400, 'Um aluno selecionado para inclusão já está neste percurso.');
      }

      const novosAlunos = await repositorioDeRotas.buscarAlunosDaRota(idDaRota, idsDosAlunosParaAdicionar);
      if (novosAlunos.length !== idsDosAlunosParaAdicionar.length) {
        throw criarErroHttp(400, 'Os novos alunos precisam estar ativos, ter endereço com lado da rua validado e pertencer à escola desta rota.');
      }
      const idsRemovidos = new Set(idsDosAlunosParaRemover);
      const alunosDoPercurso = [
        ...contextoDaRota.stops.filter((parada) => !idsRemovidos.has(parada.id)),
        ...novosAlunos,
      ];
      if (alunosDoPercurso.length > LIMITE_DE_ALUNOS_POR_ROTA) {
        throw criarErroHttp(400, `A rota aceita no máximo ${LIMITE_DE_ALUNOS_POR_ROTA} alunos.`);
      }
      if (!process.env.MAPBOX_ACCESS_TOKEN) throw criarErroHttp(503, 'MAPBOX_ACCESS_TOKEN precisa estar configurado para recalcular o percurso.');

      const rotaOtimizada = await otimizador({
        van: contextoDaRota.vanCoordinates,
        school: contextoDaRota.school,
        students: alunosDoPercurso,
        vehicleConsumptionKmPerLiter: contextoDaRota.vehicleConsumptionKmPerLiter,
      });
      const geometriaDoPercurso = await servicoDeDirecoes({
        van: contextoDaRota.vanCoordinates,
        school: contextoDaRota.school,
        optimizedRoute: rotaOtimizada,
      });
      const distanciaEmQuilometros = geometriaDoPercurso.distanceMeters / 1000;
      const duracaoEmMinutos = geometriaDoPercurso.durationSeconds / 60;
      const consumoEmQuilometrosPorLitro = Number(contextoDaRota.vehicleConsumptionKmPerLiter);
      const combustivelEstimadoEmLitros = Number.isFinite(consumoEmQuilometrosPorLitro) && consumoEmQuilometrosPorLitro > 0
        ? distanciaEmQuilometros / consumoEmQuilometrosPorLitro
        : null;

      await repositorioDeRotas.substituirParadasEMetricasDaRota({
        routeId: idDaRota,
        userId: usuario.id,
        role: usuario.role,
        stops: rotaOtimizada.stops,
        geometry: geometriaDoPercurso.geometry,
        distanceKm: distanciaEmQuilometros,
        durationMinutes: duracaoEmMinutos,
        fuelLiters: combustivelEstimadoEmLitros,
      });
      const percursoAtualizado = await repositorioDeRotas.buscarRotaDoMotoristaPorId(idDaRota);
      return { ...percursoAtualizado, optimization: rotaOtimizada.optimization };
    },
  };
}
