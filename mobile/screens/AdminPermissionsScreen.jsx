import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, StyleSheet, Switch, TouchableOpacity, View } from 'react-native';
import AccessibleText from '../components/AccessibleText.jsx';
import { usarAutenticacao } from '../context/AuthContext.js';
import { usarAparencia } from '../context/AppearanceContext.js';

export default function TelaDePermissoesAdministrativas() {
  const { sessao, sairDaConta } = usarAutenticacao();
  const { cores } = usarAparencia();
  const estilos = criarEstilos(cores);
  const [usuarios, definirUsuarios] = useState([]);
  const [carregando, definirCarregando] = useState(true);
  const [mensagemDeErro, definirMensagemDeErro] = useState('');
  const enderecoDaApi = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');
  const carregarUsuarios = useCallback(async () => {
    definirCarregando(true);
    try {
      const resposta = await fetch(`${enderecoDaApi}/api/admin/users`, { headers: { Authorization: `Bearer ${sessao.accessToken}` } });
      const dadosResposta = await resposta.json().catch(() => ({}));
      if (resposta.status === 401) await sairDaConta();
      if (!resposta.ok) throw new Error(dadosResposta.message ?? 'Não foi possível carregar os usuários.');
      definirUsuarios(dadosResposta.users ?? []); definirMensagemDeErro('');
    } catch (erro) { definirMensagemDeErro(erro.message ?? 'Falha ao carregar permissões.'); }
    finally { definirCarregando(false); }
  }, [enderecoDaApi, sairDaConta, sessao.accessToken]);
  useEffect(() => { carregarUsuarios(); }, [carregarUsuarios]);

  const atualizarPermissoes = async (usuario, alteracoes) => {
    const corpoDaRequisicao = { role: alteracoes.role ?? usuario.role, active: alteracoes.active ?? usuario.active };
    try {
      const resposta = await fetch(`${enderecoDaApi}/api/admin/users/${encodeURIComponent(usuario.id)}/permissions`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessao.accessToken}` }, body: JSON.stringify(corpoDaRequisicao) });
      const dadosResposta = await resposta.json().catch(() => ({}));
      if (resposta.status === 401) await sairDaConta();
      if (!resposta.ok) throw new Error(dadosResposta.message ?? 'Não foi possível atualizar as permissões.');
      definirUsuarios((usuariosAtuais) => usuariosAtuais.map((usuarioAtual) => usuarioAtual.id === usuario.id ? (dadosResposta.user ?? { ...usuarioAtual, ...corpoDaRequisicao }) : usuarioAtual));
    } catch (erro) { Alert.alert('Permissão não alterada', erro.message ?? 'Falha ao salvar.'); }
  };

  return <SafeAreaView style={estilos.safe}><ScrollView contentContainerStyle={estilos.content}>
    <AccessibleText style={estilos.title}>Permissões dos usuários</AccessibleText>
    <AccessibleText style={estilos.hint}>Apenas administradores podem acessar esta tela. Mantenha ao menos um administrador ativo.</AccessibleText>
    {carregando ? <ActivityIndicator style={estilos.carregando} color={cores.primary} /> : usuarios.map((usuario) => {
      const ehProprioUsuario = String(usuario.id) === String(sessao.driver.id);
      return <View key={usuario.id} style={estilos.card}>
        <AccessibleText style={estilos.name}>{usuario.name ?? usuario.nome ?? usuario.email}</AccessibleText>
        <AccessibleText style={estilos.email}>{usuario.email ?? ''}</AccessibleText>
        <View style={estilos.roleRow}>
          <AccessibleText style={estilos.roleLabel}>Perfil</AccessibleText>
          {['driver', 'admin'].map((perfil) => <TouchableOpacity key={perfil} disabled={ehProprioUsuario} accessibilityRole="radio" accessibilityState={{ selected: usuario.role === perfil }} onPress={() => atualizarPermissoes(usuario, { role: perfil })} style={[estilos.roleButton, usuario.role === perfil && estilos.roleButtonActive, ehProprioUsuario && estilos.disabled]}><AccessibleText style={[estilos.roleText, usuario.role === perfil && estilos.roleTextActive]}>{perfil === 'admin' ? 'Administrador' : 'Motorista'}</AccessibleText></TouchableOpacity>)}
        </View>
        <View style={estilos.activeRow}><AccessibleText style={estilos.roleLabel}>{usuario.active ? 'Conta ativa' : 'Conta desativada'}</AccessibleText><Switch disabled={ehProprioUsuario} value={Boolean(usuario.active)} onValueChange={(ativo) => atualizarPermissoes(usuario, { active: ativo })} trackColor={{ false: cores.border, true: cores.primary }} thumbColor={cores.surface} accessibilityLabel={`Ativar usuário ${usuario.name ?? usuario.email}`} /></View>
        {ehProprioUsuario ? <AccessibleText style={estilos.hint}>Você não pode alterar o próprio perfil ou desativar sua conta nesta tela.</AccessibleText> : null}
      </View>;
    })}
    {mensagemDeErro ? <AccessibleText accessibilityRole="alert" style={estilos.error}>{mensagemDeErro}</AccessibleText> : null}
  </ScrollView></SafeAreaView>;
}

function criarEstilos(cores) { return StyleSheet.create({ safe: { flex: 1, backgroundColor: cores.background }, content: { padding: 20, paddingBottom: 40, maxWidth: 650, width: '100%', alignSelf: 'center' }, title: { color: cores.text, fontSize: 27, fontWeight: '800' }, hint: { color: cores.subtext, fontSize: 13, lineHeight: 18, marginTop: 7 }, carregando: { margin: 30 }, card: { backgroundColor: cores.surface, borderColor: cores.border, borderWidth: 1, borderRadius: 12, padding: 14, marginTop: 13 }, name: { color: cores.text, fontSize: 16, fontWeight: '800' }, email: { color: cores.subtext, fontSize: 12, marginTop: 3 }, roleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 }, roleLabel: { color: cores.text, fontSize: 13, fontWeight: '700', flex: 1 }, roleButton: { paddingHorizontal: 9, paddingVertical: 8, borderWidth: 1, borderColor: cores.border, borderRadius: 8 }, roleButtonActive: { backgroundColor: cores.primary, borderColor: cores.primary }, roleText: { color: cores.text, fontSize: 11, fontWeight: '700' }, roleTextActive: { color: cores.primaryText }, activeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 }, disabled: { opacity: 0.55 }, error: { color: cores.danger, marginTop: 15, fontSize: 13 } }); }
