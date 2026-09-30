import React from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Switch, TouchableOpacity, View } from 'react-native';
import * as Speech from 'expo-speech';
import AccessibleText from '../components/AccessibleText.jsx';
import { usarAparencia } from '../context/AppearanceContext.js';

export default function TelaDeConfiguracoes({ navigation: navegacao }) {
  const { preferencias, atualizarPreferencias, cores } = usarAparencia();
  const estilos = criarEstilos(cores);
  const atualizarOpcao = (nomeDaPreferencia, valor) => atualizarPreferencias({ [nomeDaPreferencia]: valor }).catch((erro) => console.warn('Não foi possível salvar preferência:', erro?.message ?? erro));
  const opcoesDeTema = [
    { value: 'system', label: 'Usar tema do sistema' },
    { value: 'light', label: 'Claro' },
    { value: 'dark', label: 'Escuro' },
  ];
  return (
    <SafeAreaView style={estilos.safe}>
      <ScrollView contentContainerStyle={estilos.content}>
        {navegacao?.canGoBack() ? <TouchableOpacity accessibilityRole="button" onPress={() => navegacao.goBack()} style={estilos.back}><AccessibleText style={estilos.backText}>Voltar</AccessibleText></TouchableOpacity> : null}
        <AccessibleText style={estilos.title}>Aparência e acessibilidade</AccessibleText>
        <AccessibleText style={estilos.description}>Preferências salvas neste dispositivo.</AccessibleText>
        <AccessibleText style={estilos.section}>TEMA</AccessibleText>
        <View style={estilos.card}>
          {opcoesDeTema.map((opcao) => (
            <TouchableOpacity key={opcao.value} accessibilityRole="radio" accessibilityState={{ selected: preferencias.mode === opcao.value }} onPress={() => atualizarOpcao('mode', opcao.value)} style={estilos.option}>
              <AccessibleText style={estilos.optionText}>{opcao.label}</AccessibleText>
              <AccessibleText style={estilos.check}>{preferencias.mode === opcao.value ? '●' : '○'}</AccessibleText>
            </TouchableOpacity>
          ))}
        </View>
        <LinhaDePreferencia title="Alto contraste" hint="Aumenta a diferença entre texto, fundo e botões." value={preferencias.highContrast} onValueChange={(valor) => atualizarOpcao('highContrast', valor)} cores={cores} />
        <LinhaDePreferencia title="Letras maiores" hint="Amplia o texto nas telas do aplicativo." value={preferencias.largeText} onValueChange={(valor) => atualizarOpcao('largeText', valor)} cores={cores} />
        <LinhaDePreferencia title="Narração do percurso" hint="Lê em voz alta a sequência de paradas na tela da rota." value={preferencias.voiceGuidance} onValueChange={(valor) => atualizarOpcao('voiceGuidance', valor)} cores={cores} />
        <TouchableOpacity accessibilityRole="button" onPress={() => Speech.speak('Exemplo de narração. Próxima parada, aluno. Destino final, escola.', { language: 'pt-BR' })} style={estilos.button}>
          <AccessibleText style={estilos.buttonText}>Testar narração</AccessibleText>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function LinhaDePreferencia({ title: titulo, hint: descricao, value: habilitado, onValueChange: aoAlterar, cores }) {
  const estilos = criarEstilos(cores);
  return <View style={estilos.card}><View style={estilos.row}><View style={estilos.rowText}><AccessibleText style={estilos.optionText}>{titulo}</AccessibleText><AccessibleText style={estilos.hint}>{descricao}</AccessibleText></View><Switch value={habilitado} onValueChange={aoAlterar} trackColor={{ false: cores.border, true: cores.primary }} thumbColor={cores.surface} accessibilityLabel={titulo} /></View></View>;
}

function criarEstilos(cores) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: cores.background }, content: { padding: 22, paddingBottom: 40, maxWidth: 600, width: '100%', alignSelf: 'center' },
    back: { paddingVertical: 10 }, backText: { color: cores.primary, fontWeight: '700', fontSize: 14 }, title: { color: cores.text, fontSize: 27, fontWeight: '800' }, description: { color: cores.subtext, fontSize: 14, marginTop: 8, marginBottom: 23 },
    section: { color: cores.subtext, fontSize: 11, fontWeight: '800', letterSpacing: 1.3, marginBottom: 8 }, card: { backgroundColor: cores.surface, borderColor: cores.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, marginBottom: 12 },
    option: { minHeight: 50, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomColor: cores.border, borderBottomWidth: StyleSheet.hairlineWidth }, optionText: { color: cores.text, fontSize: 15, fontWeight: '700' }, check: { color: cores.primary, fontSize: 20, fontWeight: '800' },
    row: { minHeight: 74, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, rowText: { flex: 1 }, hint: { color: cores.subtext, fontSize: 12, lineHeight: 17, marginTop: 3 }, button: { minHeight: 50, backgroundColor: cores.primary, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 4 }, buttonText: { color: cores.primaryText, fontSize: 15, fontWeight: '800' },
  });
}
