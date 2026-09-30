import { useCallback, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as Location from 'expo-location';
import * as Network from 'expo-network';
import * as SQLite from 'expo-sqlite';
import * as TaskManager from 'expo-task-manager';

const NOME_DO_BANCO_LOCAL = 'school-transport.db';
const NOME_DA_TAREFA_DE_LOCALIZACAO = 'school-transport-background-location';
const CAMINHO_PADRAO_DA_SINCRONIZACAO = '/api/sync/events';

let promessaDoBancoLocal;
let sincronizacaoEmAndamento = false;

async function obterBancoDeDadosLocal() {
  if (!promessaDoBancoLocal) {
    promessaDoBancoLocal = SQLite.openDatabaseAsync(NOME_DO_BANCO_LOCAL).then(async (bancoLocal) => {
      await bancoLocal.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS sync_queue (
          id TEXT PRIMARY KEY NOT NULL,
          event_type TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          last_error TEXT,
          synced_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_sync_queue_pending
          ON sync_queue(synced_at, created_at);
        CREATE TABLE IF NOT EXISTS tracking_config (
          id TEXT PRIMARY KEY NOT NULL,
          route_id TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS route_cache (
          route_id TEXT PRIMARY KEY NOT NULL,
          route_json TEXT NOT NULL,
          cached_at TEXT NOT NULL
        );
      `);
      return bancoLocal;
    }).catch((erro) => {
      promessaDoBancoLocal = undefined;
      throw erro;
    });
  }
  return promessaDoBancoLocal;
}

function gerarIdentificador() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

async function inserirRegistroNaFila(tipoDoEvento, dadosDoEvento) {
  const bancoLocal = await obterBancoDeDadosLocal();
  const identificador = gerarIdentificador();
  await bancoLocal.runAsync(
    'INSERT INTO sync_queue (id, event_type, payload_json, created_at) VALUES (?, ?, ?, ?)',
    [identificador, tipoDoEvento, JSON.stringify(dadosDoEvento), new Date().toISOString()],
  );
  return identificador;
}

export async function enfileirarEventoOffline(tipoDoEvento, dadosDoEvento) {
  if (!tipoDoEvento || typeof tipoDoEvento !== 'string') throw new TypeError('O tipo do evento precisa ser um texto não vazio.');
  if (!dadosDoEvento || typeof dadosDoEvento !== 'object') throw new TypeError('Os dados do evento precisam ser um objeto.');
  return inserirRegistroNaFila(tipoDoEvento, dadosDoEvento);
}

export async function salvarCacheDaRota(percurso) {
  const idDaRota = percurso?.id ?? percurso?.routeId;
  if (!idDaRota) throw new Error('É necessário informar o identificador da rota para salvá-la no cache local.');
  const bancoLocal = await obterBancoDeDadosLocal();
  await bancoLocal.runAsync(
    `INSERT INTO route_cache (route_id, route_json, cached_at) VALUES (?, ?, ?)
     ON CONFLICT(route_id) DO UPDATE SET route_json = excluded.route_json, cached_at = excluded.cached_at`,
    [String(idDaRota), JSON.stringify(percurso), new Date().toISOString()],
  );
}

export async function carregarRotaDoCache(idDaRota) {
  if (!idDaRota) return null;
  const bancoLocal = await obterBancoDeDadosLocal();
  const registroLocal = await bancoLocal.getFirstAsync(
    'SELECT route_json FROM route_cache WHERE route_id = ?',
    [String(idDaRota)],
  );
  if (!registroLocal) return null;
  try {
    return JSON.parse(registroLocal.route_json);
  } catch {
    return null;
  }
}

async function contarEventosPendentes() {
  const bancoLocal = await obterBancoDeDadosLocal();
  const resultadoDaContagem = await bancoLocal.getFirstAsync(
    'SELECT COUNT(*) AS count FROM sync_queue WHERE synced_at IS NULL',
  );
  return Number(resultadoDaContagem?.count ?? 0);
}

export async function pararRastreamentoDeLocalizacaoEmSegundoPlano() {
  const rastreamentoIniciado = await Location.hasStartedLocationUpdatesAsync(NOME_DA_TAREFA_DE_LOCALIZACAO);
  if (rastreamentoIniciado) await Location.stopLocationUpdatesAsync(NOME_DA_TAREFA_DE_LOCALIZACAO);
}

export async function sincronizarFilaOffline({
  enderecoDaApi = process.env.EXPO_PUBLIC_API_URL,
  tokenDeAcesso,
  caminhoDeSincronizacao = CAMINHO_PADRAO_DA_SINCRONIZACAO,
  executarRequisicao = globalThis.fetch,
  limite = 100,
} = {}) {
  if (!enderecoDaApi) throw new Error('Configure EXPO_PUBLIC_API_URL para sincronizar os eventos pendentes.');
  if (typeof executarRequisicao !== 'function') throw new TypeError('É necessário informar uma implementação da API Fetch.');
  if (sincronizacaoEmAndamento) return { sincronizados: 0, pendentes: await contarEventosPendentes(), ocupada: true };

  sincronizacaoEmAndamento = true;
  try {
    const bancoLocal = await obterBancoDeDadosLocal();
    const estadoDaRede = await Network.getNetworkStateAsync().catch(() => null);
    if (estadoDaRede?.isConnected === false || estadoDaRede?.isInternetReachable === false) {
      return { sincronizados: 0, pendentes: await contarEventosPendentes(), semConexao: true };
    }

    const eventosPendentes = await bancoLocal.getAllAsync(
      'SELECT id, event_type, payload_json, created_at FROM sync_queue WHERE synced_at IS NULL ORDER BY created_at ASC LIMIT ?',
      [Math.max(1, Math.min(500, Number(limite) || 100))],
    );
    if (eventosPendentes.length === 0) return { sincronizados: 0, pendentes: 0 };

    const enderecoDoEndpoint = `${enderecoDaApi.replace(/\/+$/, '')}/${caminhoDeSincronizacao.replace(/^\/+/, '')}`;
    const cabecalhos = { 'Content-Type': 'application/json' };
    if (tokenDeAcesso) cabecalhos.Authorization = `Bearer ${tokenDeAcesso}`;

    let resposta;
    let resultado;
    try {
      resposta = await executarRequisicao(enderecoDoEndpoint, {
        method: 'POST',
        headers: cabecalhos,
        body: JSON.stringify({
          events: eventosPendentes.map((registro) => ({
            id: registro.id,
            type: registro.event_type,
            payload: JSON.parse(registro.payload_json),
            createdAt: registro.created_at,
          })),
        }),
      });
      resultado = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        const erroDeSincronizacao = new Error(resultado.message ?? `O endpoint de sincronização retornou HTTP ${resposta.status}.`);
        erroDeSincronizacao.codigoHttp = resposta.status;
        throw erroDeSincronizacao;
      }
    } catch (erro) {
      const mensagemDoErro = String(erro?.message ?? erro).slice(0, 500);
      for (const registro of eventosPendentes) {
        await bancoLocal.runAsync(
          'UPDATE sync_queue SET attempts = attempts + 1, last_error = ? WHERE id = ? AND synced_at IS NULL',
          [mensagemDoErro, registro.id],
        );
      }
      throw erro;
    }

    const idsAceitosPeloServidor = Array.isArray(resultado.acceptedIds)
      ? new Set(resultado.acceptedIds)
      : new Set(eventosPendentes.map((registro) => registro.id));
    const dataDaSincronizacao = new Date().toISOString();
    let quantidadeSincronizada = 0;
    for (const registro of eventosPendentes) {
      if (idsAceitosPeloServidor.has(registro.id)) {
        quantidadeSincronizada += 1;
        await bancoLocal.runAsync(
          'UPDATE sync_queue SET synced_at = ?, last_error = NULL WHERE id = ?',
          [dataDaSincronizacao, registro.id],
        );
      } else {
        await bancoLocal.runAsync(
          'UPDATE sync_queue SET attempts = attempts + 1, last_error = ? WHERE id = ? AND synced_at IS NULL',
          ['O servidor não confirmou o recebimento deste evento.', registro.id],
        );
      }
    }

    return { sincronizados: quantidadeSincronizada, pendentes: await contarEventosPendentes() };
  } finally {
    sincronizacaoEmAndamento = false;
  }
}

async function salvarLoteDeLocalizacoes(localizacoes) {
  if (!Array.isArray(localizacoes) || localizacoes.length === 0) return;
  const bancoLocal = await obterBancoDeDadosLocal();
  const configuracao = await bancoLocal.getFirstAsync(
    'SELECT route_id FROM tracking_config WHERE id = ?',
    ['active'],
  );
  for (const localizacao of localizacoes) {
    const coordenadas = localizacao.coords ?? {};
    await inserirRegistroNaFila('gps_location', {
      routeId: configuracao?.route_id ?? null,
      recordedAt: localizacao.timestamp ? new Date(localizacao.timestamp).toISOString() : new Date().toISOString(),
      coordinates: [coordenadas.longitude, coordenadas.latitude],
      accuracyMeters: coordenadas.accuracy ?? null,
      altitudeMeters: coordenadas.altitude ?? null,
      headingDegrees: coordenadas.heading ?? null,
      speedMetersPerSecond: coordenadas.speed ?? null,
    });
  }
}

if (!TaskManager.isTaskDefined?.(NOME_DA_TAREFA_DE_LOCALIZACAO)) {
  TaskManager.defineTask(NOME_DA_TAREFA_DE_LOCALIZACAO, async ({ data: dadosDaTarefa, error: erroDaTarefa }) => {
    if (erroDaTarefa) {
      console.warn('Background location task failed:', erroDaTarefa.message);
      return;
    }
    try {
      await salvarLoteDeLocalizacoes(dadosDaTarefa?.locations ?? []);
    } catch (erroDaFila) {
      console.warn('Could not save background locations offline:', erroDaFila?.message ?? erroDaFila);
    }
  });
}

export function usarRastreamentoEmSegundoPlano({
  idDaRota,
  enderecoDaApi = process.env.EXPO_PUBLIC_API_URL,
  tokenDeAcesso,
  aoNaoAutorizado,
  caminhoDeSincronizacao = CAMINHO_PADRAO_DA_SINCRONIZACAO,
  habilitado = true,
  intervaloDeSincronizacaoMs = 30000,
} = {}) {
  const [rastreamentoAtivo, definirRastreamentoAtivo] = useState(false);
  const [eventosPendentes, definirEventosPendentes] = useState(0);
  const [ultimaSincronizacao, definirUltimaSincronizacao] = useState(null);
  const [erroDeRastreamento, definirErroDeRastreamento] = useState(null);

  const atualizarContagemDePendencias = useCallback(async () => {
    definirEventosPendentes(await contarEventosPendentes());
  }, []);

  const sincronizarAgora = useCallback(async () => {
    try {
      const resultado = await sincronizarFilaOffline({ enderecoDaApi, tokenDeAcesso, caminhoDeSincronizacao });
      await atualizarContagemDePendencias();
      if (resultado.sincronizados > 0) definirUltimaSincronizacao(new Date().toISOString());
      return resultado;
    } catch (erroDeSincronizacao) {
      definirErroDeRastreamento(erroDeSincronizacao?.message ?? String(erroDeSincronizacao));
      if (erroDeSincronizacao?.codigoHttp === 401) await aoNaoAutorizado?.();
      throw erroDeSincronizacao;
    }
  }, [enderecoDaApi, tokenDeAcesso, aoNaoAutorizado, atualizarContagemDePendencias, caminhoDeSincronizacao]);

  const iniciarRastreamento = useCallback(async () => {
    definirErroDeRastreamento(null);
    if (!habilitado) throw new Error('O rastreamento em segundo plano está desativado para esta rota.');
    if (!idDaRota) throw new Error('Informe o identificador da rota antes de iniciar o rastreamento.');
    if (!(await TaskManager.isAvailableAsync())) throw new Error('As tarefas em segundo plano não estão disponíveis neste aparelho.');

    const permissaoEmPrimeiroPlano = await Location.requestForegroundPermissionsAsync();
    if (permissaoEmPrimeiroPlano.status !== 'granted') throw new Error('A permissão de localização em primeiro plano não foi concedida.');
    const permissaoEmSegundoPlano = await Location.requestBackgroundPermissionsAsync();
    if (permissaoEmSegundoPlano.status !== 'granted') throw new Error('A permissão de localização em segundo plano não foi concedida.');

    const bancoLocal = await obterBancoDeDadosLocal();
    await bancoLocal.runAsync(
      'INSERT INTO tracking_config (id, route_id) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET route_id = excluded.route_id',
      ['active', String(idDaRota)],
    );

    const rastreamentoJaIniciado = await Location.hasStartedLocationUpdatesAsync(NOME_DA_TAREFA_DE_LOCALIZACAO);
    if (!rastreamentoJaIniciado) {
      await Location.startLocationUpdatesAsync(NOME_DA_TAREFA_DE_LOCALIZACAO, {
        accuracy: Location.Accuracy.High,
        timeInterval: 15000,
        distanceInterval: 25,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        activityType: Location.ActivityType.AutomotiveNavigation,
        ...(Platform.OS === 'android' ? {
          foregroundService: {
            notificationTitle: 'Transporte escolar ativo',
            notificationBody: 'O GPS da rota está sendo registrado com segurança.',
            killServiceOnDestroy: false,
          },
        } : {}),
      });
    }
    definirRastreamentoAtivo(true);
    await atualizarContagemDePendencias();
  }, [habilitado, atualizarContagemDePendencias, idDaRota]);

  const pararRastreamento = useCallback(async () => {
    await pararRastreamentoDeLocalizacaoEmSegundoPlano();
    definirRastreamentoAtivo(false);
    await atualizarContagemDePendencias();
  }, [atualizarContagemDePendencias]);

  useEffect(() => {
    let componenteMontado = true;
    const atualizarEstadoDoRastreamento = async () => {
      try {
        const [rastreamentoIniciado, quantidadeDeEventosPendentes] = await Promise.all([
          Location.hasStartedLocationUpdatesAsync(NOME_DA_TAREFA_DE_LOCALIZACAO),
          contarEventosPendentes(),
        ]);
        if (componenteMontado) {
          definirRastreamentoAtivo(rastreamentoIniciado);
          definirEventosPendentes(quantidadeDeEventosPendentes);
        }
      } catch (erroDoEstado) {
        if (componenteMontado) definirErroDeRastreamento(erroDoEstado?.message ?? String(erroDoEstado));
      }
    };
    atualizarEstadoDoRastreamento();
    return () => { componenteMontado = false; };
  }, []);

  useEffect(() => {
    if (!enderecoDaApi || !habilitado) return undefined;
    const intervalo = setInterval(() => {
      sincronizarAgora().catch(() => {});
    }, intervaloDeSincronizacaoMs);
    const inscricaoDeEstado = AppState.addEventListener('change', (estadoDoAplicativo) => {
      if (estadoDoAplicativo === 'active') sincronizarAgora().catch(() => {});
    });
    return () => {
      clearInterval(intervalo);
      inscricaoDeEstado.remove();
    };
  }, [enderecoDaApi, habilitado, intervaloDeSincronizacaoMs, sincronizarAgora]);

  return {
    rastreamentoAtivo,
    eventosPendentes,
    ultimaSincronizacao,
    erro: erroDeRastreamento,
    iniciarRastreamento,
    pararRastreamento,
    sincronizarAgora,
    atualizarContagemDePendencias,
  };
}

export default usarRastreamentoEmSegundoPlano;
