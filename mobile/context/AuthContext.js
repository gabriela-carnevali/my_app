import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

const CHAVE_DA_SESSAO = 'school-transport.auth-session.v1';
const contextoDeAutenticacao = createContext(null);

function obterEnderecoBaseDaApi() {
  const enderecoDaApi = process.env.EXPO_PUBLIC_API_URL;
  if (!enderecoDaApi) throw new Error('Configure EXPO_PUBLIC_API_URL para conectar com a API.');
  return enderecoDaApi.replace(/\/+$/, '');
}

async function lerRespostaHttp(resposta) {
  return resposta.json().catch(() => ({}));
}

export function ProvedorDeAutenticacao({ children: elementosFilhos }) {
  const [sessao, definirSessao] = useState(null);
  const [carregando, definirCarregando] = useState(true);

  useEffect(() => {
    let componenteMontado = true;
    const restaurarSessao = async () => {
      try {
        const sessaoSerializada = await SecureStore.getItemAsync(CHAVE_DA_SESSAO);
        if (!sessaoSerializada) return;
        const sessaoSalva = JSON.parse(sessaoSerializada);
        if (!sessaoSalva?.accessToken || !sessaoSalva?.expiresAt
          || new Date(sessaoSalva.expiresAt).getTime() <= Date.now()) {
          await SecureStore.deleteItemAsync(CHAVE_DA_SESSAO);
          return;
        }

        try {
          const resposta = await fetch(`${obterEnderecoBaseDaApi()}/api/auth/me`, {
            headers: { Authorization: `Bearer ${sessaoSalva.accessToken}` },
          });
          if (resposta.status === 401) {
            await SecureStore.deleteItemAsync(CHAVE_DA_SESSAO);
            return;
          }
          if (resposta.ok) {
            const dadosResposta = await lerRespostaHttp(resposta);
            sessaoSalva.driver = dadosResposta.driver ?? sessaoSalva.driver;
          }
        } catch {
          // Mantém a sessão ainda válida para permitir o acesso às rotas salvas sem conexão.
        }
        if (componenteMontado) definirSessao(sessaoSalva);
      } catch (erro) {
        console.warn('Não foi possível restaurar a sessão segura:', erro?.message ?? erro);
      } finally {
        if (componenteMontado) definirCarregando(false);
      }
    };
    restaurarSessao();
    return () => { componenteMontado = false; };
  }, []);

  const entrarNaConta = useCallback(async ({ email: enderecoDeEmail, password: senha }) => {
    const enderecoBase = obterEnderecoBaseDaApi();
    let resposta;
    try {
      resposta = await fetch(`${enderecoBase}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: enderecoDeEmail, password: senha }),
      });
    } catch {
      throw new Error('Não foi possível conectar à API. Verifique a rede e o endereço do servidor.');
    }

    const dadosResposta = await lerRespostaHttp(resposta);
    if (!resposta.ok) throw new Error(dadosResposta.message ?? `Falha no login (HTTP ${resposta.status}).`);
    const novaSessao = {
      accessToken: dadosResposta.accessToken,
      expiresAt: dadosResposta.expiresAt,
      driver: dadosResposta.driver,
    };
    if (!novaSessao.accessToken || !novaSessao.expiresAt || !novaSessao.driver?.id) {
      throw new Error('A API retornou uma resposta de autenticação incompleta.');
    }
    await SecureStore.setItemAsync(CHAVE_DA_SESSAO, JSON.stringify(novaSessao));
    definirSessao(novaSessao);
    return novaSessao;
  }, []);

  const sairDaConta = useCallback(async () => {
    await SecureStore.deleteItemAsync(CHAVE_DA_SESSAO).catch((erro) => {
      console.warn('Não foi possível remover a sessão segura:', erro?.message ?? erro);
    });
    definirSessao(null);
  }, []);

  const valorDoContexto = useMemo(() => ({ sessao, carregando, entrarNaConta, sairDaConta }), [sessao, carregando, entrarNaConta, sairDaConta]);
  return <contextoDeAutenticacao.Provider value={valorDoContexto}>{elementosFilhos}</contextoDeAutenticacao.Provider>;
}

export function usarAutenticacao() {
  const contexto = useContext(contextoDeAutenticacao);
  if (!contexto) throw new Error('usarAutenticacao precisa ser usado dentro de ProvedorDeAutenticacao.');
  return contexto;
}
