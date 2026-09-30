import React, { useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, SafeAreaView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import AccessibleText from '../components/AccessibleText.jsx';
import { usarAutenticacao } from '../context/AuthContext.js';
import { usarAparencia } from '../context/AppearanceContext.js';

export default function TelaDeLogin({ navigation: navegacao }) {
  const { entrarNaConta } = usarAutenticacao();
  const { cores, preferencias } = usarAparencia();
  const estilos = criarEstilos(cores, preferencias.largeText);
  const [enderecoDeEmail, definirEmail] = useState('');
  const [senha, definirSenha] = useState('');
  const [enviandoCredenciais, definirEnvioDeCredenciais] = useState(false);
  const [mensagemDeErro, definirMensagemDeErro] = useState(null);
  const referenciaDoCampoSenha = useRef(null);
  const enviarCredenciais = async () => {
    if (!enderecoDeEmail.trim() || !senha) { definirMensagemDeErro('Informe seu e-mail e sua senha.'); return; }
    definirEnvioDeCredenciais(true); definirMensagemDeErro(null);
    try { await entrarNaConta({ email: enderecoDeEmail.trim(), password: senha }); }
    catch (erro) { definirMensagemDeErro(erro.message ?? 'Não foi possível entrar.'); }
    finally { definirEnvioDeCredenciais(false); }
  };
  return <SafeAreaView style={estilos.safeArea}><KeyboardAvoidingView style={estilos.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><View style={estilos.content}>
    <AccessibleText style={estilos.mark}>ROTA SEGURA</AccessibleText>
    <AccessibleText style={estilos.title}>Acesso</AccessibleText>
    <AccessibleText style={estilos.description}>Entre com as credenciais fornecidas pela gestão do transporte escolar.</AccessibleText>
    <TouchableOpacity accessibilityRole="button" onPress={() => navegacao.navigate('Settings')} style={estilos.settingsLink}><AccessibleText style={estilos.settingsText}>Tema e acessibilidade</AccessibleText></TouchableOpacity>
    <TextInput accessibilityLabel="E-mail" autoCapitalize="none" autoComplete="email" autoCorrect={false} keyboardType="email-address" onChangeText={definirEmail} onSubmitEditing={() => referenciaDoCampoSenha.current?.focus()} placeholder="E-mail" placeholderTextColor={cores.subtext} returnKeyType="next" style={estilos.input} textContentType="emailAddress" value={enderecoDeEmail} />
    <TextInput accessibilityLabel="Senha" autoCapitalize="none" autoComplete="password" onChangeText={definirSenha} onSubmitEditing={enviarCredenciais} placeholder="Senha" placeholderTextColor={cores.subtext} returnKeyType="go" secureTextEntry style={[estilos.input, estilos.passwordInput]} ref={referenciaDoCampoSenha} textContentType="password" value={senha} />
    {mensagemDeErro ? <AccessibleText accessibilityRole="alert" style={estilos.error}>{mensagemDeErro}</AccessibleText> : null}
    <TouchableOpacity accessibilityRole="button" disabled={enviandoCredenciais} onPress={enviarCredenciais} style={estilos.button}>{enviandoCredenciais ? <ActivityIndicator color={cores.primaryText} /> : <AccessibleText style={estilos.buttonText}>Entrar</AccessibleText>}</TouchableOpacity>
  </View></KeyboardAvoidingView></SafeAreaView>;
}

function criarEstilos(cores, ampliarTexto) { return StyleSheet.create({ safeArea: { flex: 1, backgroundColor: cores.background }, container: { flex: 1, justifyContent: 'center', padding: 24 }, content: { maxWidth: 460, width: '100%', alignSelf: 'center' }, mark: { color: cores.primary, fontSize: 11, fontWeight: '800', letterSpacing: 2 }, title: { color: cores.text, fontSize: 29, fontWeight: '800', marginTop: 10 }, description: { color: cores.subtext, fontSize: 15, lineHeight: 22, marginTop: 10, marginBottom: 15 }, settingsLink: { alignSelf: 'flex-start', paddingVertical: 8, marginBottom: 10 }, settingsText: { color: cores.primary, fontSize: 14, fontWeight: '700' }, input: { minHeight: ampliarTexto ? 62 : 50, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: cores.border, color: cores.text, backgroundColor: cores.input, fontSize: ampliarTexto ? 19 : 15 }, passwordInput: { marginTop: 10 }, error: { color: cores.danger, fontSize: 13, lineHeight: 19, marginTop: 12 }, button: { minHeight: 50, borderRadius: 10, backgroundColor: cores.primary, alignItems: 'center', justifyContent: 'center', marginTop: 16 }, buttonText: { color: cores.primaryText, fontWeight: '800', fontSize: 15 } }); }
