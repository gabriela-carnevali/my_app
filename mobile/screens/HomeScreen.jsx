import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import AccessibleText from '../components/AccessibleText.jsx';
import { usarAutenticacao } from '../context/AuthContext.js';
import { usarAparencia } from '../context/AppearanceContext.js';

export default function TelaInicial({ navigation: navegacao }) {
  const { sessao, sairDaConta } = usarAutenticacao();
  const { cores, preferencias } = usarAparencia();
  const estilos = criarEstilos(cores, preferencias.largeText);
  const [idDaRota, definirIdDaRota] = useState('');
  const [rotasDisponiveis, definirRotasDisponiveis] = useState([]);
  const [carregandoRotas, definirCarregandoRotas] = useState(true);
  const [erroAoCarregarRotas, definirErroAoCarregarRotas] = useState('');
  const ehAdministrador = sessao?.driver?.role === 'admin';
  const enderecoDaApi = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');

  useEffect(() => {
    let componenteAtivo = true;
    fetch(`${enderecoDaApi}/api/routes`, { headers: { Authorization: `Bearer ${sessao.accessToken}` } })
      .then(async (resposta) => {
        const dadosResposta = await resposta.json().catch(() => ({}));
        if (resposta.status === 401) await sairDaConta();
        if (!resposta.ok) throw new Error(dadosResposta.message ?? 'Não foi possível carregar suas rotas.');
        if (componenteAtivo) { definirRotasDisponiveis(dadosResposta.routes ?? []); definirErroAoCarregarRotas(''); }
      }).catch((erro) => { if (componenteAtivo) definirErroAoCarregarRotas(erro.message ?? 'Falha ao carregar rotas.'); })
      .finally(() => { if (componenteAtivo) definirCarregandoRotas(false); });
    return () => { componenteAtivo = false; };
  }, [enderecoDaApi, sairDaConta, sessao.accessToken]);

  const abrirRota = () => {
    const identificadorDaRota = idDaRota.trim();
    if (!identificadorDaRota) { Alert.alert('Informe a rota', 'Digite o identificador do percurso que deseja abrir.'); return; }
    navegacao.navigate('DriverRoute', { routeId: identificadorDaRota });
  };
  const editarRota = () => {
    const identificadorDaRota = idDaRota.trim();
    if (!identificadorDaRota) { Alert.alert('Informe a rota', 'Digite o identificador do percurso do dia para editar.'); return; }
    navegacao.navigate('RouteEditor', { routeId: identificadorDaRota });
  };
  const confirmarSaidaDaConta = () => Alert.alert('Sair da conta', 'Deseja encerrar sua sessão neste dispositivo?', [
    { text: 'Cancelar', style: 'cancel' }, { text: 'Sair', style: 'destructive', onPress: () => sairDaConta() },
  ]);
  return <SafeAreaView style={estilos.areaSegura}><ScrollView contentContainerStyle={estilos.containerDaTela}><View style={estilos.conteudo}>
    <View style={estilos.linhaSuperior}><AccessibleText style={estilos.marca}>ROTA SEGURA</AccessibleText><TouchableOpacity accessibilityRole="button" onPress={() => navegacao.navigate('Settings')} style={estilos.botaoSuperior}><AccessibleText style={estilos.textoBotaoSuperior}>Acessibilidade</AccessibleText></TouchableOpacity><TouchableOpacity accessibilityRole="button" onPress={confirmarSaidaDaConta} style={estilos.botaoSuperior}><AccessibleText style={estilos.textoSair}>Sair</AccessibleText></TouchableOpacity></View>
    <AccessibleText style={estilos.titulo}>Transporte escolar</AccessibleText>
    <AccessibleText style={estilos.descricao}>Olá, {sessao?.driver?.name ?? 'usuário'}. {ehAdministrador ? 'Acesse a operação e as ferramentas administrativas.' : 'Informe a rota atribuída para iniciar a navegação e registrar presenças.'}</AccessibleText>
    <TextInput accessibilityLabel="Identificador da rota" autoCapitalize="none" autoCorrect={false} onChangeText={definirIdDaRota} onSubmitEditing={abrirRota} placeholder="ID da rota" placeholderTextColor={cores.subtext} returnKeyType="go" style={estilos.campoEntrada} value={idDaRota} />
    <BotaoDeAcao rotulo="Abrir rota GPS" aoPressionar={abrirRota} estilos={estilos} cores={cores} />
    <BotaoDeAcao rotulo={ehAdministrador ? 'Editar percurso' : 'Editar percurso deste dia'} aoPressionar={editarRota} estilos={estilos} cores={cores} secundario />
    <AccessibleText style={estilos.secao}>ROTAS DISPONÍVEIS</AccessibleText>
    {carregandoRotas ? <ActivityIndicator style={estilos.carregandoRotas} color={cores.primary} /> : rotasDisponiveis.length ? rotasDisponiveis.map((percurso) => (
      <View key={percurso.id} style={estilos.cartaoRota}>
        <AccessibleText style={estilos.nomeRota}>{percurso.schoolName ?? 'Rota escolar'}</AccessibleText>
        <AccessibleText style={estilos.informacoesRota}>{percurso.routeDate} · {percurso.stopCount} aluno(s){percurso.distanceKm != null ? ` · ${Number(percurso.distanceKm).toFixed(1)} km` : ''}</AccessibleText>
        <View style={estilos.acoesDaRota}>
          <TouchableOpacity accessibilityRole="button" onPress={() => navegacao.navigate('DriverRoute', { routeId: percurso.id })} style={estilos.botaoDaRota}><AccessibleText style={estilos.textoDoBotaoDaRota}>Abrir GPS</AccessibleText></TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" onPress={() => navegacao.navigate('RouteEditor', { routeId: percurso.id })} style={[estilos.botaoDaRota, estilos.botaoSecundarioDaRota]}><AccessibleText style={estilos.textoDoBotaoSecundarioDaRota}>Editar</AccessibleText></TouchableOpacity>
        </View>
      </View>
    )) : <AccessibleText style={estilos.estadoSemRotas}>{erroAoCarregarRotas || 'Nenhum percurso ativo disponível.'}</AccessibleText>}
    {ehAdministrador ? <>
      <AccessibleText style={estilos.secao}>ADMINISTRAÇÃO</AccessibleText>
      <BotaoDeAcao rotulo="Adicionar novo aluno" aoPressionar={() => navegacao.navigate('NewStudent')} estilos={estilos} cores={cores} secundario />
      <BotaoDeAcao rotulo="Controlar permissões de usuários" aoPressionar={() => navegacao.navigate('AdminPermissions')} estilos={estilos} cores={cores} secundario />
    </> : null}
  </View></ScrollView></SafeAreaView>;
}

function BotaoDeAcao({ rotulo, aoPressionar, estilos, cores, secundario }) {
  return <TouchableOpacity accessibilityRole="button" onPress={aoPressionar} style={[estilos.botao, secundario && estilos.secundario]}><AccessibleText style={[estilos.textoBotao, secundario && { color: cores.primary }]}>{rotulo}</AccessibleText></TouchableOpacity>;
}

function criarEstilos(cores, ampliarTexto) { return StyleSheet.create({
  areaSegura: { flex: 1, backgroundColor: cores.background }, containerDaTela: { flexGrow: 1, justifyContent: 'center', backgroundColor: cores.background, padding: 24 }, conteudo: { maxWidth: 480, width: '100%', alignSelf: 'center' },
  linhaSuperior: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }, marca: { color: cores.primary, fontSize: 11, fontWeight: '800', letterSpacing: 1.6, flex: 1 }, botaoSuperior: { paddingVertical: 8, paddingHorizontal: 5 }, textoBotaoSuperior: { color: cores.primary, fontSize: 12, fontWeight: '700' }, textoSair: { color: cores.danger, fontSize: 13, fontWeight: '700' },
  titulo: { color: cores.text, fontSize: 29, fontWeight: '800', marginTop: 10 }, descricao: { color: cores.subtext, fontSize: 15, lineHeight: 22, marginTop: 10, marginBottom: 23 }, campoEntrada: { minHeight: ampliarTexto ? 62 : 50, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: cores.border, color: cores.text, backgroundColor: cores.input, fontSize: ampliarTexto ? 19 : 15 },
  botao: { minHeight: 50, borderRadius: 10, backgroundColor: cores.primary, alignItems: 'center', justifyContent: 'center', marginTop: 12, paddingHorizontal: 10 }, secundario: { backgroundColor: cores.surface, borderColor: cores.primary, borderWidth: 1 }, textoBotao: { color: cores.primaryText, fontWeight: '800', fontSize: 14, textAlign: 'center' }, secao: { color: cores.subtext, fontSize: 11, fontWeight: '800', letterSpacing: 1.3, marginTop: 25, marginBottom: 2 },
  carregandoRotas: { margin: 20 }, cartaoRota: { padding: 13, marginTop: 9, borderWidth: 1, borderColor: cores.border, borderRadius: 11, backgroundColor: cores.surface }, nomeRota: { color: cores.text, fontSize: 15, fontWeight: '800' }, informacoesRota: { color: cores.subtext, fontSize: 12, marginTop: 4 }, acoesDaRota: { flexDirection: 'row', gap: 8, marginTop: 10 }, botaoDaRota: { flex: 1, minHeight: 40, borderRadius: 8, backgroundColor: cores.primary, alignItems: 'center', justifyContent: 'center' }, textoDoBotaoDaRota: { color: cores.primaryText, fontSize: 13, fontWeight: '800' }, botaoSecundarioDaRota: { backgroundColor: cores.surface, borderColor: cores.primary, borderWidth: 1 }, textoDoBotaoSecundarioDaRota: { color: cores.primary, fontSize: 13, fontWeight: '800' }, estadoSemRotas: { color: cores.subtext, fontSize: 13, marginTop: 8 },
}); }
