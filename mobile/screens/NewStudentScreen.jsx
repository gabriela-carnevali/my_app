import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import AccessibleText from '../components/AccessibleText.jsx';
import { usarAutenticacao } from '../context/AuthContext.js';
import { usarAparencia } from '../context/AppearanceContext.js';

const FORMULARIO_INICIAL = { name: '', photoUrl: '', street: '', number: '', complement: '', facadeLon: '', facadeLat: '', startLon: '', startLat: '', endLon: '', endLat: '' };
export default function TelaDeNovoAluno() {
  const { sessao, sairDaConta } = usarAutenticacao();
  const { cores, preferencias } = usarAparencia();
  const estilos = criarEstilos(cores, preferencias.largeText);
  const [escolas, definirEscolas] = useState([]);
  const [idDaEscola, definirIdDaEscola] = useState('');
  const [camposDoFormulario, definirCamposDoFormulario] = useState(FORMULARIO_INICIAL);
  const [carregando, definirCarregando] = useState(true);
  const [salvando, definirSalvando] = useState(false);
  const [mensagemDeErro, definirMensagemDeErro] = useState('');
  const enderecoDaApi = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');

  useEffect(() => {
    let componenteAtivo = true;
    fetch(`${enderecoDaApi}/api/schools`, { headers: { Authorization: `Bearer ${sessao.accessToken}` } })
      .then(async (resposta) => {
        const dadosResposta = await resposta.json().catch(() => ({}));
        if (resposta.status === 401) await sairDaConta();
        if (!resposta.ok) throw new Error(dadosResposta.message ?? 'Não foi possível carregar escolas.');
        if (componenteAtivo) { definirEscolas(dadosResposta.schools ?? []); if (dadosResposta.schools?.length) definirIdDaEscola(dadosResposta.schools[0].id); }
      }).catch((erro) => { if (componenteAtivo) definirMensagemDeErro(erro.message); }).finally(() => { if (componenteAtivo) definirCarregando(false); });
    return () => { componenteAtivo = false; };
  }, [sairDaConta, enderecoDaApi, sessao.accessToken]);

  const atualizarCampo = (nomeDoCampo) => (valor) => definirCamposDoFormulario((valoresAtuais) => ({ ...valoresAtuais, [nomeDoCampo]: valor }));
  const cadastrarAluno = async () => {
    definirMensagemDeErro('');
    if (!idDaEscola) { definirMensagemDeErro('Cadastre uma escola antes de adicionar alunos.'); return; }
    const nomesDosCamposDeCoordenada = ['facadeLon', 'facadeLat', 'startLon', 'startLat', 'endLon', 'endLat'];
    const coordenadas = Object.fromEntries(nomesDosCamposDeCoordenada.map((nomeDoCampo) => [nomeDoCampo, Number(camposDoFormulario[nomeDoCampo].replace(',', '.'))]));
    if (!camposDoFormulario.name.trim() || !camposDoFormulario.street.trim() || !camposDoFormulario.number.trim() || nomesDosCamposDeCoordenada.some((nomeDoCampo) => camposDoFormulario[nomeDoCampo].trim() === '' || !Number.isFinite(coordenadas[nomeDoCampo]))) {
      definirMensagemDeErro('Preencha nome, endereço e todas as coordenadas da fachada e do trecho da rua.'); return;
    }
    definirSalvando(true);
    try {
      const resposta = await fetch(`${enderecoDaApi}/api/students`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessao.accessToken}` },
        body: JSON.stringify({ schoolId: idDaEscola, name: camposDoFormulario.name.trim(), photoUrl: camposDoFormulario.photoUrl.trim() || null, street: camposDoFormulario.street.trim(), number: camposDoFormulario.number.trim(), complement: camposDoFormulario.complement.trim(), facadeCoordinates: [coordenadas.facadeLon, coordenadas.facadeLat], roadStartCoordinates: [coordenadas.startLon, coordenadas.startLat], roadEndCoordinates: [coordenadas.endLon, coordenadas.endLat] }),
      });
      const dadosResposta = await resposta.json().catch(() => ({}));
      if (resposta.status === 401) await sairDaConta();
      if (!resposta.ok) throw new Error(dadosResposta.message ?? `Falha ao cadastrar aluno (${resposta.status}).`);
      Alert.alert('Aluno cadastrado', `${dadosResposta.student?.name ?? camposDoFormulario.name} foi adicionado com endereço validado pelo lado direito da rua.`);
      definirCamposDoFormulario(FORMULARIO_INICIAL);
    } catch (erro) { definirMensagemDeErro(erro.message ?? 'Não foi possível salvar o aluno.'); }
    finally { definirSalvando(false); }
  };

  if (carregando) return <SafeAreaView style={estilos.safe}><ActivityIndicator color={cores.primary} /></SafeAreaView>;
  return (
    <SafeAreaView style={estilos.safe}>
      <ScrollView contentContainerStyle={estilos.content} keyboardShouldPersistTaps="handled">
        <AccessibleText style={estilos.title}>Adicionar aluno</AccessibleText>
        <AccessibleText style={estilos.note}>A coordenada da fachada e o sentido do trecho da rua devem posicionar o imóvel à direita do veículo.</AccessibleText>
        <AccessibleText style={estilos.label}>Escola</AccessibleText>
        {escolas.length ? <View style={estilos.schoolList}>{escolas.map((escola) => <TouchableOpacity key={escola.id} onPress={() => definirIdDaEscola(escola.id)} style={[estilos.school, escola.id === idDaEscola && estilos.schoolSelected]}><AccessibleText style={escola.id === idDaEscola ? estilos.schoolTextSelected : estilos.schoolText}>{escola.name ?? escola.nome}</AccessibleText></TouchableOpacity>)}</View> : <AccessibleText style={estilos.note}>Nenhuma escola disponível.</AccessibleText>}
        <AccessibleText style={estilos.label}>Dados do aluno</AccessibleText>
        <CampoDeFormulario label="Nome completo" value={camposDoFormulario.name} onChangeText={atualizarCampo('name')} cores={cores} largeText={preferencias.largeText} />
        <CampoDeFormulario label="URL da foto (opcional)" value={camposDoFormulario.photoUrl} onChangeText={atualizarCampo('photoUrl')} cores={cores} largeText={preferencias.largeText} />
        <AccessibleText style={estilos.label}>Endereço</AccessibleText>
        <CampoDeFormulario label="Logradouro" value={camposDoFormulario.street} onChangeText={atualizarCampo('street')} cores={cores} largeText={preferencias.largeText} />
        <CampoDeFormulario label="Número" value={camposDoFormulario.number} onChangeText={atualizarCampo('number')} cores={cores} largeText={preferencias.largeText} />
        <CampoDeFormulario label="Complemento (opcional)" value={camposDoFormulario.complement} onChangeText={atualizarCampo('complement')} cores={cores} largeText={preferencias.largeText} />
        <AccessibleText style={estilos.label}>Coordenadas (longitude, latitude)</AccessibleText>
        <CampoDeFormulario label="Fachada · longitude" value={camposDoFormulario.facadeLon} onChangeText={atualizarCampo('facadeLon')} keyboardType="decimal-pad" cores={cores} largeText={preferencias.largeText} />
        <CampoDeFormulario label="Fachada · latitude" value={camposDoFormulario.facadeLat} onChangeText={atualizarCampo('facadeLat')} keyboardType="decimal-pad" cores={cores} largeText={preferencias.largeText} />
        <CampoDeFormulario label="Rua · início longitude" value={camposDoFormulario.startLon} onChangeText={atualizarCampo('startLon')} keyboardType="decimal-pad" cores={cores} largeText={preferencias.largeText} />
        <CampoDeFormulario label="Rua · início latitude" value={camposDoFormulario.startLat} onChangeText={atualizarCampo('startLat')} keyboardType="decimal-pad" cores={cores} largeText={preferencias.largeText} />
        <CampoDeFormulario label="Rua · fim longitude" value={camposDoFormulario.endLon} onChangeText={atualizarCampo('endLon')} keyboardType="decimal-pad" cores={cores} largeText={preferencias.largeText} />
        <CampoDeFormulario label="Rua · fim latitude" value={camposDoFormulario.endLat} onChangeText={atualizarCampo('endLat')} keyboardType="decimal-pad" cores={cores} largeText={preferencias.largeText} />
        {mensagemDeErro ? <AccessibleText accessibilityRole="alert" style={estilos.error}>{mensagemDeErro}</AccessibleText> : null}
        <TouchableOpacity disabled={salvando} onPress={cadastrarAluno} style={estilos.button}>{salvando ? <ActivityIndicator color={cores.primaryText} /> : <AccessibleText style={estilos.buttonText}>Salvar aluno</AccessibleText>}</TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function CampoDeFormulario({ label: rotulo, value: valor, onChangeText: aoAlterarTexto, keyboardType: tipoDeTeclado, cores, largeText: ampliarTexto }) {
  const estilos = criarEstilos(cores, ampliarTexto);
  return <TextInput accessibilityLabel={rotulo} placeholder={rotulo} placeholderTextColor={cores.subtext} value={valor} onChangeText={aoAlterarTexto} keyboardType={tipoDeTeclado ?? 'default'} style={estilos.input} />;
}

function criarEstilos(cores, ampliarTexto) { return StyleSheet.create({
  safe: { flex: 1, backgroundColor: cores.background }, content: { padding: 20, paddingBottom: 40, maxWidth: 650, width: '100%', alignSelf: 'center' },
  title: { color: cores.text, fontSize: 27, fontWeight: '800' }, note: { color: cores.subtext, fontSize: 13, lineHeight: 19, marginTop: 8, marginBottom: 10 }, label: { color: cores.text, fontSize: 15, fontWeight: '800', marginTop: 18, marginBottom: 8 },
  schoolList: { gap: 7 }, school: { borderWidth: 1, borderColor: cores.border, borderRadius: 9, padding: 12, backgroundColor: cores.surface }, schoolSelected: { borderColor: cores.primary, borderWidth: 2 }, schoolText: { color: cores.text, fontSize: 14 }, schoolTextSelected: { color: cores.primary, fontSize: 14, fontWeight: '800' },
  input: { minHeight: ampliarTexto ? 60 : 48, paddingHorizontal: 13, marginBottom: 9, borderWidth: 1, borderColor: cores.border, borderRadius: 9, backgroundColor: cores.input, color: cores.text, fontSize: ampliarTexto ? 19 : 15 }, error: { color: cores.danger, fontSize: 13, marginVertical: 10 }, button: { minHeight: 50, backgroundColor: cores.primary, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 15 }, buttonText: { color: cores.primaryText, fontWeight: '800', fontSize: 15 },
}); }
