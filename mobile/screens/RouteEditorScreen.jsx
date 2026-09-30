import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import AccessibleText from '../components/AccessibleText.jsx';
import { usarAutenticacao } from '../context/AuthContext.js';
import { usarAparencia } from '../context/AppearanceContext.js';
import { LIMITE_DE_ALUNOS_POR_ROTA } from '../constants/routeLimits.js';

export default function TelaDeEdicaoDoPercurso({ route: rotaDeNavegacao, navigation: navegacao }) {
  const idDaRota = rotaDeNavegacao?.params?.routeId;
  const { sessao, sairDaConta } = usarAutenticacao();
  const { cores } = usarAparencia();
  const estilos = criarEstilos(cores);
  const [percurso, definirPercurso] = useState(null);
  const [alunosElegiveis, definirAlunosElegiveis] = useState([]);
  const [idsDosAlunosParaAdicionar, definirIdsDosAlunosParaAdicionar] = useState([]);
  const [idsDosAlunosParaRemover, definirIdsDosAlunosParaRemover] = useState([]);
  const [carregandoDados, definirCarregandoDados] = useState(true);
  const [salvandoAlteracoes, definirSalvandoAlteracoes] = useState(false);
  const [mensagemDeErro, definirMensagemDeErro] = useState('');
  const enderecoDaApi = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');
  const cabecalhosDeAutenticacao = { Authorization: `Bearer ${sessao.accessToken}` };

  const carregarPercurso = useCallback(async () => {
    if (!idDaRota) { definirMensagemDeErro('Informe o identificador da rota.'); definirCarregandoDados(false); return; }
    definirCarregandoDados(true); definirMensagemDeErro('');
    try {
      const [respostaDaRota, respostaDosCandidatos] = await Promise.all([
        fetch(`${enderecoDaApi}/api/routes/${encodeURIComponent(idDaRota)}`, { headers: cabecalhosDeAutenticacao }),
        fetch(`${enderecoDaApi}/api/routes/${encodeURIComponent(idDaRota)}/candidates`, { headers: cabecalhosDeAutenticacao }),
      ]);
      const [dadosDaRota, dadosDosCandidatos] = await Promise.all([respostaDaRota.json().catch(() => ({})), respostaDosCandidatos.json().catch(() => ({}))]);
      if (respostaDaRota.status === 401 || respostaDosCandidatos.status === 401) await sairDaConta();
      if (!respostaDaRota.ok) throw new Error(dadosDaRota.message ?? 'Não foi possível carregar o percurso.');
      if (!respostaDosCandidatos.ok) throw new Error(dadosDosCandidatos.message ?? 'Não foi possível carregar alunos elegíveis.');
      definirPercurso(dadosDaRota.route ?? dadosDaRota); definirAlunosElegiveis(dadosDosCandidatos.students ?? dadosDosCandidatos.candidates ?? []); definirIdsDosAlunosParaAdicionar([]); definirIdsDosAlunosParaRemover([]);
    } catch (erro) { definirMensagemDeErro(erro.message ?? 'Falha ao abrir o percurso.'); }
    finally { definirCarregandoDados(false); }
  }, [enderecoDaApi, sairDaConta, idDaRota, sessao.accessToken]);

  useEffect(() => { carregarPercurso(); }, [carregarPercurso]);
  const paradas = percurso?.stops ?? [];
  const quantidadeProjetadaDeAlunos = paradas.length
    - idsDosAlunosParaRemover.length
    + idsDosAlunosParaAdicionar.length;
  const limiteDeAlunosAtingido = quantidadeProjetadaDeAlunos >= LIMITE_DE_ALUNOS_POR_ROTA;
  const alternarSelecao = (idDoAluno, listaDeIds, atualizarLista) => atualizarLista((idsAtuais) => idsAtuais.includes(idDoAluno) ? idsAtuais.filter((id) => id !== idDoAluno) : [...idsAtuais, idDoAluno]);

  const salvarAlteracoes = async () => {
    if (quantidadeProjetadaDeAlunos > LIMITE_DE_ALUNOS_POR_ROTA) {
      definirMensagemDeErro(`O percurso pode ter no máximo ${LIMITE_DE_ALUNOS_POR_ROTA} alunos.`);
      return;
    }
    definirSalvandoAlteracoes(true); definirMensagemDeErro('');
    try {
      const resposta = await fetch(`${enderecoDaApi}/api/routes/${encodeURIComponent(idDaRota)}/stops`, {
        method: 'PUT', headers: { ...cabecalhosDeAutenticacao, 'Content-Type': 'application/json' }, body: JSON.stringify({ addStudentIds: idsDosAlunosParaAdicionar, removeStudentIds: idsDosAlunosParaRemover }),
      });
      const dadosResposta = await resposta.json().catch(() => ({}));
      if (resposta.status === 401) await sairDaConta();
      if (!resposta.ok) throw new Error(dadosResposta.message ?? 'Não foi possível recalcular o percurso.');
      const percursoAtualizado = dadosResposta.route ?? dadosResposta;
      definirPercurso(percursoAtualizado); definirIdsDosAlunosParaAdicionar([]); definirIdsDosAlunosParaRemover([]);
      await carregarPercurso();
      Alert.alert('Percurso recalculado', `Distância atualizada: ${Number(percursoAtualizado.distanceKm ?? 0).toFixed(1)} km.`);
    } catch (erro) { definirMensagemDeErro(erro.message ?? 'Falha ao salvar alterações.'); }
    finally { definirSalvandoAlteracoes(false); }
  };

  if (carregandoDados) return <SafeAreaView style={estilos.centered}><ActivityIndicator color={cores.primary} /></SafeAreaView>;
  return <SafeAreaView style={estilos.safe}><ScrollView contentContainerStyle={estilos.content}>
    <AccessibleText style={estilos.title}>{sessao.driver?.role === 'admin' ? 'Editar percurso' : 'Editar percurso do dia'}</AccessibleText>
    <AccessibleText style={estilos.hint}>As alterações são aplicadas somente à rota {idDaRota ?? 'informada'} e a sequência será recalculada antes de salvar.</AccessibleText>
    <AccessibleText style={estilos.capacity}>Alunos neste percurso: {quantidadeProjetadaDeAlunos}/{LIMITE_DE_ALUNOS_POR_ROTA}</AccessibleText>
    {percurso?.distanceKm != null && <AccessibleText style={estilos.metric}>Atual: {Number(percurso.distanceKm).toFixed(1)} km · {Math.round(percurso.estimatedDurationMinutes ?? 0)} min</AccessibleText>}
    <AccessibleText style={estilos.section}>ALUNOS NESTE PERCURSO</AccessibleText>
    {paradas.map((parada) => { const aluno = parada.student ?? parada.aluno ?? parada; const idDoAluno = aluno.id ?? parada.aluno_id; const selecionado = idsDosAlunosParaRemover.includes(idDoAluno); return <TouchableOpacity key={idDoAluno} accessibilityRole="checkbox" accessibilityState={{ checked: selecionado }} onPress={() => alternarSelecao(idDoAluno, idsDosAlunosParaRemover, definirIdsDosAlunosParaRemover)} style={[estilos.person, selecionado && estilos.marked]}><AccessibleText style={estilos.personName}>{aluno.name ?? aluno.nome}</AccessibleText><AccessibleText style={selecionado ? estilos.remove : estilos.keep}>{selecionado ? 'Será removido' : 'Toque para remover'}</AccessibleText></TouchableOpacity>; })}
    <AccessibleText style={estilos.section}>ADICIONAR ALUNO ELEGÍVEL</AccessibleText>
    {alunosElegiveis.length ? alunosElegiveis.map((aluno) => { const selecionado = idsDosAlunosParaAdicionar.includes(aluno.id); const bloqueadoPorLimite = !selecionado && limiteDeAlunosAtingido; return <TouchableOpacity key={aluno.id} disabled={bloqueadoPorLimite} accessibilityRole="checkbox" accessibilityState={{ checked: selecionado, disabled: bloqueadoPorLimite }} onPress={() => alternarSelecao(aluno.id, idsDosAlunosParaAdicionar, definirIdsDosAlunosParaAdicionar)} style={[estilos.person, selecionado && estilos.selected, bloqueadoPorLimite && estilos.disabled]}><AccessibleText style={estilos.personName}>{aluno.name ?? aluno.nome}</AccessibleText><AccessibleText style={selecionado ? estilos.added : estilos.add}>{selecionado ? 'Será adicionado' : bloqueadoPorLimite ? 'Limite de 27 alunos atingido' : 'Toque para adicionar'}</AccessibleText><AccessibleText style={estilos.address}>{aluno.address?.label ?? ''}</AccessibleText></TouchableOpacity>; }) : <AccessibleText style={estilos.hint}>Não há outros alunos ativos dessa escola com endereço validado.</AccessibleText>}
    {mensagemDeErro ? <AccessibleText accessibilityRole="alert" style={estilos.error}>{mensagemDeErro}</AccessibleText> : null}
    <TouchableOpacity disabled={salvandoAlteracoes || quantidadeProjetadaDeAlunos > LIMITE_DE_ALUNOS_POR_ROTA || (!idsDosAlunosParaAdicionar.length && !idsDosAlunosParaRemover.length)} onPress={salvarAlteracoes} style={[estilos.button, (salvandoAlteracoes || quantidadeProjetadaDeAlunos > LIMITE_DE_ALUNOS_POR_ROTA || (!idsDosAlunosParaAdicionar.length && !idsDosAlunosParaRemover.length)) && estilos.disabled]}>{salvandoAlteracoes ? <ActivityIndicator color={cores.primaryText} /> : <AccessibleText style={estilos.buttonText}>Recalcular e salvar rota</AccessibleText>}</TouchableOpacity>
    <TouchableOpacity onPress={() => navegacao.navigate('DriverRoute', { routeId: idDaRota })} style={estilos.secondary}><AccessibleText style={estilos.secondaryText}>Ver rota do motorista</AccessibleText></TouchableOpacity>
  </ScrollView></SafeAreaView>;
}

function criarEstilos(cores) { return StyleSheet.create({
  safe: { flex: 1, backgroundColor: cores.background }, centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: cores.background }, content: { padding: 20, paddingBottom: 40, maxWidth: 650, width: '100%', alignSelf: 'center' },
  title: { color: cores.text, fontSize: 27, fontWeight: '800' }, hint: { color: cores.subtext, fontSize: 13, lineHeight: 19, marginTop: 7 }, capacity: { color: cores.primary, fontSize: 14, fontWeight: '800', marginTop: 12 }, metric: { color: cores.primary, fontSize: 15, fontWeight: '800', marginTop: 14 }, section: { color: cores.subtext, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginTop: 22, marginBottom: 8 },
  person: { backgroundColor: cores.surface, borderWidth: 1, borderColor: cores.border, padding: 12, borderRadius: 10, marginBottom: 8 }, marked: { borderColor: cores.danger, borderWidth: 2 }, selected: { borderColor: cores.primary, borderWidth: 2 }, personName: { color: cores.text, fontSize: 15, fontWeight: '700' }, remove: { color: cores.danger, fontSize: 12, marginTop: 4 }, keep: { color: cores.subtext, fontSize: 12, marginTop: 4 }, added: { color: cores.primary, fontSize: 12, fontWeight: '700', marginTop: 4 }, add: { color: cores.subtext, fontSize: 12, marginTop: 4 }, address: { color: cores.subtext, fontSize: 11, marginTop: 3 },
  error: { color: cores.danger, fontSize: 13, marginVertical: 12 }, button: { minHeight: 52, backgroundColor: cores.primary, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 18 }, disabled: { opacity: 0.5 }, buttonText: { color: cores.primaryText, fontSize: 15, fontWeight: '800' }, secondary: { alignItems: 'center', padding: 15 }, secondaryText: { color: cores.primary, fontWeight: '700', fontSize: 14 },
}); }
