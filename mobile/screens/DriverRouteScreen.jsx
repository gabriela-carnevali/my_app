import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import MapView, { Marker, Polyline } from 'react-native-maps';
import {
  enfileirarEventoOffline,
  carregarRotaDoCache,
  salvarCacheDaRota,
  pararRastreamentoDeLocalizacaoEmSegundoPlano,
  usarRastreamentoEmSegundoPlano,
} from '../hooks/useBackgroundTracking.js';
import { usarAutenticacao } from '../context/AuthContext.js';
import { usarAparencia } from '../context/AppearanceContext.js';
import AccessibleText from '../components/AccessibleText.jsx';

const Texto = AccessibleText;

const ACOES_POR_STATUS = {
  Aguardando: [
    { status: 'Embarcado', label: 'Embarcou', tone: 'primary' },
    { status: 'Ausente', label: 'Ausente', tone: 'muted' },
  ],
  Embarcado: [{ status: 'Desembarcado', label: 'Desembarcou', tone: 'primary' }],
  Ausente: [],
  Desembarcado: [],
};

function obterCoordenada(valor) {
  if (!valor) return null;
  const coordenadas = Array.isArray(valor)
    ? valor
    : valor.coordinates ?? valor.coordinate ?? valor.location ?? valor;
  const longitude = Number(coordenadas.longitude ?? coordenadas.lon ?? coordenadas.lng ?? coordenadas[0]);
  const latitude = Number(coordenadas.latitude ?? coordenadas.lat ?? coordenadas[1]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function obterStatusDaParada(parada) {
  return parada.status ?? parada.status_parada ?? parada.student?.status ?? 'Aguardando';
}

function obterAlunoDaParada(parada) {
  return parada.student ?? parada.aluno ?? parada;
}

export default function TelaDaRotaDoMotorista({
  route: rotaDeNavegacao,
  navigation: navegacao,
  routeData: dadosDaRotaRecebidos,
  routeId: idDaRotaRecebido,
  apiUrl: enderecoDaApi = process.env.EXPO_PUBLIC_API_URL,
  authToken: tokenRecebido,
  onUpdateStudentStatus: aoAtualizarStatusDoAluno,
  onRouteLoaded: aoCarregarRota,
}) {
  const percursoRecebido = dadosDaRotaRecebidos ?? rotaDeNavegacao?.params?.route ?? null;
  const idDaRota = idDaRotaRecebido ?? rotaDeNavegacao?.params?.routeId ?? percursoRecebido?.id ?? null;
  const { sessao, sairDaConta } = usarAutenticacao();
  const { cores, preferencias } = usarAparencia();
  const estilos = criarEstilos(cores);
  const tokenDeAcesso = tokenRecebido ?? sessao?.accessToken;
  const [percurso, definirPercurso] = useState(percursoRecebido ?? null);
  const [carregandoPercurso, definirCarregamentoDoPercurso] = useState(Boolean(!percursoRecebido && idDaRota));
  const [erroDoPercurso, definirErroDoPercurso] = useState(null);
  const [paradas, definirParadas] = useState(percursoRecebido?.stops ?? []);
  const [idDoAlunoSalvando, definirIdDoAlunoSalvando] = useState(null);
  const [localizacaoAtualDaVan, definirLocalizacaoAtualDaVan] = useState(null);
  const referenciaDoMapa = useRef(null);
  const referenciaDaRotaNarrada = useRef(null);
  const ehMotorista = sessao?.driver?.role === 'driver';
  const tratarAcessoNaoAutorizado = useCallback(async () => {
    await pararRastreamentoDeLocalizacaoEmSegundoPlano().catch(() => {});
    await sairDaConta();
  }, [sairDaConta]);

  const rastreamento = usarRastreamentoEmSegundoPlano({ idDaRota, enderecoDaApi, tokenDeAcesso, aoNaoAutorizado: tratarAcessoNaoAutorizado, habilitado: ehMotorista });

  useEffect(() => () => {
    pararRastreamentoDeLocalizacaoEmSegundoPlano().catch((erro) => {
      console.warn('Could not stop GPS tracking after closing the route screen:', erro?.message ?? erro);
    });
  }, []);

  useEffect(() => {
    if (percursoRecebido) {
      const percursoComId = { ...percursoRecebido, id: percursoRecebido.id ?? idDaRota };
      definirPercurso(percursoComId);
      definirParadas(percursoComId.stops ?? []);
      salvarCacheDaRota(percursoComId).catch((erro) => {
        console.warn('Could not cache route locally:', erro?.message ?? erro);
      });
    }
  }, [idDaRota, percursoRecebido]);

  useEffect(() => {
    if (percursoRecebido || !idDaRota) {
      definirCarregamentoDoPercurso(false);
      return undefined;
    }
    let requisicaoCancelada = false;
    let encontrouPercursoEmCache = false;
    definirCarregamentoDoPercurso(true);
    definirErroDoPercurso(null);
    const cabecalhos = tokenDeAcesso ? { Authorization: `Bearer ${tokenDeAcesso}` } : {};
    const carregarPercurso = async () => {
      try {
        const percursoEmCache = await carregarRotaDoCache(idDaRota);
        if (requisicaoCancelada) return;
        if (percursoEmCache) {
          encontrouPercursoEmCache = true;
          definirPercurso(percursoEmCache);
          definirParadas(percursoEmCache.stops ?? []);
          definirCarregamentoDoPercurso(false);
        }
      } catch (erro) {
        console.warn('Could not read the local route cache:', erro?.message ?? erro);
      }

      if (!enderecoDaApi) {
        if (!requisicaoCancelada) {
          if (!encontrouPercursoEmCache) definirErroDoPercurso('Configure EXPO_PUBLIC_API_URL ou carregue a rota antes de ficar offline.');
          definirCarregamentoDoPercurso(false);
        }
        return;
      }

      try {
        const resposta = await fetch(`${enderecoDaApi.replace(/\/+$/, '')}/api/routes/${encodeURIComponent(idDaRota)}`, { headers: cabecalhos });
        const dadosResposta = await resposta.json().catch(() => ({}));
        if (!resposta.ok) {
          if (resposta.status === 401) await sairDaConta();
          throw new Error(dadosResposta.message ?? `Não foi possível carregar a rota (HTTP ${resposta.status}).`);
        }
        const percursoCarregado = dadosResposta.route ?? dadosResposta;
        if (requisicaoCancelada) return;
        definirPercurso(percursoCarregado);
        definirParadas(percursoCarregado.stops ?? []);
        salvarCacheDaRota(percursoCarregado).catch((erro) => {
          console.warn('Could not cache route locally:', erro?.message ?? erro);
        });
        aoCarregarRota?.(percursoCarregado);
      } catch (erro) {
        if (!requisicaoCancelada && !encontrouPercursoEmCache) definirErroDoPercurso(erro.message ?? 'Falha ao carregar a rota.');
      } finally {
        if (!requisicaoCancelada) definirCarregamentoDoPercurso(false);
      }
    };
    carregarPercurso();
    return () => { requisicaoCancelada = true; };
  }, [enderecoDaApi, tokenDeAcesso, sairDaConta, aoCarregarRota, idDaRota, percursoRecebido]);

  const paradasOrdenadas = useMemo(
    () => [...paradas].sort((paradaEsquerda, paradaDireita) => (paradaEsquerda.order ?? paradaEsquerda.ordem_otimizada ?? 0) - (paradaDireita.order ?? paradaDireita.ordem_otimizada ?? 0)),
    [paradas],
  );
  useEffect(() => {
    let inscricaoDeLocalizacao;
    let componenteAtivo = true;
    (async () => {
      try {
        const permissaoDeLocalizacao = await Location.requestForegroundPermissionsAsync();
        if (!componenteAtivo || permissaoDeLocalizacao.status !== 'granted') return;
        inscricaoDeLocalizacao = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: 3000, distanceInterval: 5 },
          (posicao) => definirLocalizacaoAtualDaVan({ latitude: posicao.coords.latitude, longitude: posicao.coords.longitude }),
        );
      } catch (erro) {
        console.warn('Could not watch foreground van location:', erro?.message ?? erro);
      }
    })();
    return () => { componenteAtivo = false; inscricaoDeLocalizacao?.remove(); };
  }, []);
  const coordenadaDeOrigem = obterCoordenada(percurso?.origin?.coordinates ?? percurso?.van?.coordinates ?? percurso?.van);
  const coordenadaDaEscola = obterCoordenada(percurso?.destination?.coordinates ?? percurso?.school?.coordinates ?? percurso?.school);
  const coordenadasDoTrajeto = percurso?.geometry?.coordinates
    ?? percurso?.routeGeometry?.geometry?.coordinates
    ?? percurso?.route_geometry?.coordinates
    ?? [];
  const primeiraParada = paradasOrdenadas[0] ?? null;
  const ultimaParada = paradasOrdenadas[paradasOrdenadas.length - 1] ?? null;
  const distanciaInformada = percurso?.totalDistanceKm ?? percurso?.distanceKm ?? percurso?.distancia_total_km;
  const duracaoInformada = percurso?.estimatedDurationMinutes ?? percurso?.tempo_estimado_min;
  const consumoInformado = percurso?.estimatedFuelLiters ?? percurso?.consumo_estimado_l;
  const distanciaEmKm = distanciaInformada == null ? NaN : Number(distanciaInformada);
  const duracaoEmMinutos = duracaoInformada == null ? NaN : Number(duracaoInformada);
  const combustivelEmLitros = consumoInformado == null ? NaN : Number(consumoInformado);
  const centroDoMapa = coordenadaDeOrigem
    ?? obterCoordenada(primeiraParada?.coordinates ?? primeiraParada?.facadeCoordinates ?? primeiraParada?.endereco)
    ?? coordenadaDaEscola
    ?? { latitude: -23.5505, longitude: -46.6333 };

  useEffect(() => {
    if (!coordenadaDeOrigem || !referenciaDoMapa.current) return;
    referenciaDoMapa.current.animateToRegion({
      ...coordenadaDeOrigem,
      latitudeDelta: 0.035,
      longitudeDelta: 0.035,
    }, 350);
  }, [coordenadaDeOrigem?.latitude, coordenadaDeOrigem?.longitude]);

  const narrarPercurso = () => {
    const nomesDasParadas = paradasOrdenadas.map((parada, indice) => {
      const aluno = obterAlunoDaParada(parada);
      const endereco = parada.address?.label ?? parada.endereco?.logradouro ?? aluno.addressLabel ?? '';
      return `Parada ${indice + 1}, ${aluno.name ?? aluno.nome ?? 'Aluno'}${endereco ? `, ${endereco}` : ''}`;
    });
    if (!nomesDasParadas.length) nomesDasParadas.push('Nenhuma parada de aluno cadastrada');
    nomesDasParadas.push(`Destino final, ${percurso?.school?.name ?? percurso?.destination?.name ?? percurso?.escola?.nome ?? 'escola'}`);
    Speech.stop();
    Speech.speak(`Percurso escolar. ${nomesDasParadas.join('. ')}`, { language: 'pt-BR', rate: 0.9 });
  };

  useEffect(() => {
    const assinaturaDoPercurso = `${idDaRota ?? ''}:${paradasOrdenadas.map((parada) => obterAlunoDaParada(parada).id ?? parada.id).join(',')}`;
    if (preferencias.voiceGuidance && paradasOrdenadas.length && assinaturaDoPercurso !== referenciaDaRotaNarrada.current) {
      referenciaDaRotaNarrada.current = assinaturaDoPercurso;
      narrarPercurso();
    }
  }, [preferencias.voiceGuidance, idDaRota, paradasOrdenadas]);

  useEffect(() => () => { Speech.stop(); }, []);

  const atualizarStatusDoAluno = async (parada, novoStatus) => {
    const aluno = obterAlunoDaParada(parada);
    const idDoAluno = aluno.id ?? parada.aluno_id;
    if (!idDoAluno || !idDaRota) {
      Alert.alert('Não foi possível registrar', 'A rota e o identificador do aluno são necessários para salvar a presença.');
      return;
    }
    definirIdDoAlunoSalvando(idDoAluno);
    const eventoDePresenca = {
      routeId: String(idDaRota),
      studentId: String(idDoAluno),
      status: novoStatus,
      recordedAt: new Date().toISOString(),
    };
    try {
      await enfileirarEventoOffline('attendance_status', eventoDePresenca);
      definirParadas((paradasAtuais) => paradasAtuais.map((paradaAtual) => {
        const alunoDaParada = obterAlunoDaParada(paradaAtual);
        return String(alunoDaParada.id ?? paradaAtual.aluno_id) === String(idDoAluno)
          ? { ...paradaAtual, status: novoStatus, student: { ...alunoDaParada, status: novoStatus } }
          : paradaAtual;
      }));
      const percursoEmCache = percurso ?? await carregarRotaDoCache(idDaRota);
      if (percursoEmCache) {
        const percursoAtualizado = {
          ...percursoEmCache,
          stops: (percursoEmCache.stops ?? []).map((paradaAtual) => {
            const alunoDaParada = obterAlunoDaParada(paradaAtual);
            return String(alunoDaParada.id ?? paradaAtual.aluno_id) === String(idDoAluno)
              ? { ...paradaAtual, status: novoStatus, student: { ...alunoDaParada, status: novoStatus } }
              : paradaAtual;
          }),
        };
        definirPercurso(percursoAtualizado);
        await salvarCacheDaRota(percursoAtualizado);
      }
      try {
        await aoAtualizarStatusDoAluno?.(eventoDePresenca);
      } catch (erroDoRetorno) {
        // The SQLite queue remains authoritative until the backend acknowledges the event.
        console.warn('Attendance callback failed; event remains queued:', erroDoRetorno?.message ?? erroDoRetorno);
      }
      await rastreamento.atualizarContagemDePendencias();
      if (enderecoDaApi) rastreamento.sincronizarAgora().catch(() => {});
    } catch (erro) {
      Alert.alert('Presença não salva', erro.message ?? 'Não foi possível gravar a alteração no armazenamento offline.');
    } finally {
      definirIdDoAlunoSalvando(null);
    }
  };

  const alternarRastreamentoGps = async () => {
    try {
      if (rastreamento.rastreamentoAtivo) await rastreamento.pararRastreamento();
      else await rastreamento.iniciarRastreamento();
    } catch (erro) {
      Alert.alert('Rastreamento GPS', erro.message ?? 'Não foi possível alterar o rastreamento.');
    }
  };

  const encerrarSessao = async () => {
    try {
      await rastreamento.pararRastreamento();
    } catch (erro) {
      console.warn('Could not stop background tracking before sign out:', erro?.message ?? erro);
    }
    await sairDaConta();
  };

  if (carregandoPercurso) {
    return (
      <SafeAreaView style={estilos.centered}>
        <ActivityIndicator size="large" color="#176B55" />
        <Texto style={estilos.loadingText}>Carregando a rota…</Texto>
      </SafeAreaView>
    );
  }

  if (!percurso && !percursoRecebido) {
    return (
      <SafeAreaView style={estilos.centered}>
        <Texto style={estilos.emptyTitle}>Rota indisponível</Texto>
        <Texto style={estilos.emptyText}>{erroDoPercurso ?? 'Informe uma rota ou configure EXPO_PUBLIC_API_URL para carregá-la.'}</Texto>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={estilos.container}>
      <View style={estilos.header}>
        <View style={estilos.headerTitle}>
          <Texto style={estilos.eyebrow}>ROTA ESCOLAR</Texto>
          <Texto style={estilos.title}>{percurso?.school?.name ?? percurso?.destination?.name ?? percurso?.escola?.nome ?? 'Viagem de hoje'}</Texto>
        </View>
        <View style={estilos.headerActions}>
          {ehMotorista ? <TouchableOpacity
            accessibilityRole="button"
            onPress={alternarRastreamentoGps}
            style={[estilos.gpsButton, rastreamento.rastreamentoAtivo && estilos.gpsButtonActive]}
          >
            <Texto style={estilos.gpsButtonText}>{rastreamento.rastreamentoAtivo ? 'GPS ativo · Parar' : 'Iniciar GPS'}</Texto>
          </TouchableOpacity> : null}
          <TouchableOpacity accessibilityRole="button" onPress={() => navegacao?.navigate('RouteEditor', { routeId: idDaRota })} style={estilos.logoutButton}>
            <Texto style={estilos.logoutText}>Editar</Texto>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" onPress={() => navegacao?.navigate('Settings')} style={estilos.logoutButton}>
            <Texto style={estilos.logoutText}>A11y</Texto>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" onPress={encerrarSessao} style={estilos.logoutButton}>
            <Texto style={estilos.logoutText}>Sair</Texto>
          </TouchableOpacity>
        </View>
      </View>

      <View style={estilos.mapWrap}>
        <MapView
          ref={referenciaDoMapa}
          style={StyleSheet.absoluteFill}
          initialRegion={{ ...centroDoMapa, latitudeDelta: 0.035, longitudeDelta: 0.035 }}
          showsUserLocation
          showsMyLocationButton
          accessibilityLabel="Mapa da rota escolar"
        >
          {coordenadasDoTrajeto.length > 1 && (
            <Polyline
            coordinates={coordenadasDoTrajeto.map(obterCoordenada).filter(Boolean)}
              strokeColor="#176B55"
              strokeWidth={5}
            />
          )}
          {coordenadaDeOrigem && <Marker coordinate={coordenadaDeOrigem} title="Origem da van" pinColor="#3157A4" />}
          {localizacaoAtualDaVan && <Marker coordinate={localizacaoAtualDaVan} title="Van · localização ao vivo" description="Posição atual do dispositivo" pinColor="#176B55" />}
          {paradasOrdenadas.map((parada, indice) => {
            const aluno = obterAlunoDaParada(parada);
            const coordenada = obterCoordenada(parada.coordinates ?? parada.facadeCoordinates ?? parada.address?.coordinates ?? parada.endereco);
            return coordenada ? (
              <Marker
                key={String(aluno.id ?? indice)}
                coordinate={coordenada}
                title={`${indice + 1}. ${aluno.name ?? aluno.nome ?? 'Aluno'}`}
                description={obterStatusDaParada(parada)}
                pinColor={obterStatusDaParada(parada) === 'Embarcado' ? '#176B55' : '#E8942D'}
              />
            ) : null;
          })}
          {coordenadaDaEscola && <Marker coordinate={coordenadaDaEscola} title="Escola · destino final" pinColor="#B74444" />}
        </MapView>
      </View>

      <View style={estilos.routeMeta}>
        <View style={estilos.anchorCard}>
          <Texto style={estilos.anchorLabel}>PRIMEIRA PARADA · MAIS PRÓXIMA DA VAN</Texto>
          <Texto style={estilos.anchorName}>{primeiraParada ? (obterAlunoDaParada(primeiraParada).name ?? obterAlunoDaParada(primeiraParada).nome) : 'Sem alunos'}</Texto>
        </View>
        <View style={estilos.anchorCard}>
          <Texto style={estilos.anchorLabel}>ÚLTIMA PARADA ANTES DA ESCOLA</Texto>
          <Texto style={estilos.anchorName}>{ultimaParada ? (obterAlunoDaParada(ultimaParada).name ?? obterAlunoDaParada(ultimaParada).nome) : 'Destino: escola'}</Texto>
        </View>
      </View>
      {(Number.isFinite(distanciaEmKm) || Number.isFinite(duracaoEmMinutos) || Number.isFinite(combustivelEmLitros)) && (
        <Texto style={estilos.tripSummary}>
          {Number.isFinite(distanciaEmKm) ? `${distanciaEmKm.toFixed(1)} km` : '—'}
          {'  ·  '}{Number.isFinite(duracaoEmMinutos) ? `${Math.round(duracaoEmMinutos)} min` : '—'}
          {'  ·  '}{Number.isFinite(combustivelEmLitros) ? `${combustivelEmLitros.toFixed(2)} L estimados` : '—'}
        </Texto>
      )}
      <View style={estilos.narrationRow}>
        <Texto style={estilos.pendingText}>{localizacaoAtualDaVan ? 'Localização ao vivo atualizada' : 'Aguardando posição GPS'}</Texto>
        <TouchableOpacity accessibilityRole="button" onPress={narrarPercurso} style={estilos.narrationButton}>
          <Texto style={estilos.narrationText}>{preferencias.voiceGuidance ? 'Ouvir percurso' : 'Narrar percurso'}</Texto>
        </TouchableOpacity>
      </View>

      <View style={estilos.listHeader}>
        <Texto style={estilos.listTitle}>Sequência de embarque</Texto>
        <Texto style={estilos.pendingText}>{rastreamento.eventosPendentes} pendente(s) de sincronização</Texto>
      </View>

      <ScrollView contentContainerStyle={estilos.listContent}>
        {paradasOrdenadas.map((parada, indice) => {
          const aluno = obterAlunoDaParada(parada);
          const idDoAluno = aluno.id ?? parada.aluno_id ?? indice;
          const status = obterStatusDaParada(parada);
          const acoesDisponiveis = ACOES_POR_STATUS[status] ?? [];
          return (
            <View key={String(idDoAluno)} style={estilos.studentCard}>
              <View style={estilos.studentHeading}>
                <View style={estilos.sequenceBadge}><Texto style={estilos.sequenceText}>{indice + 1}</Texto></View>
                <View style={estilos.studentDetails}>
                  <Texto style={estilos.studentName}>{aluno.name ?? aluno.nome ?? `Aluno ${indice + 1}`}</Texto>
                  <Texto style={estilos.studentSubtext}>{aluno.address?.label ?? aluno.endereco?.logradouro ?? aluno.addressLabel ?? 'Parada pela calçada'}</Texto>
                </View>
                <Texto style={[estilos.status, status === 'Embarcado' && estilos.statusBoarded]}>{status}</Texto>
              </View>
              {ehMotorista && acoesDisponiveis.length > 0 && (
                <View style={estilos.actions}>
                  {acoesDisponiveis.map((acao) => (
                    <TouchableOpacity
                      key={acao.status}
                      accessibilityRole="button"
                      disabled={idDoAlunoSalvando === idDoAluno}
                      onPress={() => atualizarStatusDoAluno(parada, acao.status)}
                      style={[estilos.actionButton, acao.tone === 'muted' && estilos.actionButtonMuted]}
                    >
                      <Texto style={[estilos.actionText, acao.tone === 'muted' && estilos.actionTextMuted]}>
                        {idDoAlunoSalvando === idDoAluno ? 'Salvando…' : acao.label}
                      </Texto>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
      {rastreamento.erro ? <Texto style={estilos.errorText}>{rastreamento.erro}</Texto> : null}
    </SafeAreaView>
  );
}

function criarEstilos(cores) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: cores.background },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: cores.background },
    loadingText: { marginTop: 12, color: cores.subtext, fontSize: 15 },
    emptyTitle: { color: cores.text, fontSize: 20, fontWeight: '700', marginBottom: 8 },
    emptyText: { color: cores.subtext, textAlign: 'center', lineHeight: 21 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', paddingHorizontal: 14, paddingVertical: 10 },
    headerTitle: { flex: 1, minWidth: 130 },
    headerActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 3 },
    eyebrow: { fontSize: 10, color: cores.subtext, letterSpacing: 1.5, fontWeight: '700' },
    title: { color: cores.text, fontSize: 19, fontWeight: '700', marginTop: 3 },
    gpsButton: { backgroundColor: cores.primary, borderRadius: 9, paddingVertical: 10, paddingHorizontal: 9 },
    gpsButtonActive: { backgroundColor: cores.danger },
    gpsButtonText: { color: cores.primaryText, fontWeight: '700', fontSize: 11 },
    logoutButton: { paddingHorizontal: 5, paddingVertical: 9 },
    logoutText: { color: cores.primary, fontWeight: '700', fontSize: 11 },
    mapWrap: { height: 250, marginHorizontal: 14, borderRadius: 15, overflow: 'hidden', backgroundColor: cores.muted },
    routeMeta: { flexDirection: 'row', gap: 9, paddingHorizontal: 14, paddingTop: 12 },
    anchorCard: { flex: 1, padding: 10, backgroundColor: cores.surface, borderRadius: 10, borderWidth: 1, borderColor: cores.border },
    anchorLabel: { color: cores.subtext, fontSize: 8, fontWeight: '700', letterSpacing: 0.4 },
    anchorName: { color: cores.text, fontSize: 13, fontWeight: '700', marginTop: 5 },
    tripSummary: { paddingTop: 7, paddingHorizontal: 18, color: cores.subtext, fontSize: 11, fontWeight: '600' },
    narrationRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingTop: 6 },
    narrationButton: { borderWidth: 1, borderColor: cores.primary, borderRadius: 7, paddingHorizontal: 9, paddingVertical: 5 },
    narrationText: { color: cores.primary, fontSize: 11, fontWeight: '700' },
    listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingTop: 12, paddingBottom: 8 },
    listTitle: { color: cores.text, fontSize: 16, fontWeight: '700' },
    pendingText: { color: cores.subtext, fontSize: 10 },
    listContent: { paddingHorizontal: 14, paddingBottom: 24 },
    studentCard: { padding: 12, backgroundColor: cores.surface, borderRadius: 12, marginBottom: 9, borderWidth: 1, borderColor: cores.border },
    studentHeading: { flexDirection: 'row', alignItems: 'center' },
    sequenceBadge: { width: 29, height: 29, borderRadius: 15, backgroundColor: cores.muted, alignItems: 'center', justifyContent: 'center' },
    sequenceText: { color: cores.primary, fontWeight: '700', fontSize: 13 },
    studentDetails: { flex: 1, marginLeft: 10 },
    studentName: { color: cores.text, fontSize: 14, fontWeight: '700' },
    studentSubtext: { color: cores.subtext, fontSize: 11, marginTop: 3 },
    status: { color: cores.warningText, backgroundColor: cores.warning, borderRadius: 8, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 5, fontSize: 10, fontWeight: '700' },
    statusBoarded: { color: cores.primary, backgroundColor: cores.muted },
    actions: { flexDirection: 'row', gap: 8, marginTop: 11, marginLeft: 39 },
    actionButton: { backgroundColor: cores.primary, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
    actionButtonMuted: { backgroundColor: cores.muted },
    actionText: { color: cores.primaryText, fontSize: 11, fontWeight: '700' },
    actionTextMuted: { color: cores.mutedText },
    errorText: { paddingHorizontal: 16, paddingBottom: 8, color: cores.danger, fontSize: 11 },
  });
}
