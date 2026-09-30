import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const CHAVE_DAS_PREFERENCIAS = 'school-transport.appearance.v1';
const contextoDeAparencia = createContext(null);
const paletaClara = {
  background: '#F5F7F6', surface: '#FFFFFF', text: '#20342A', subtext: '#65736B',
  border: '#D6E0D9', primary: '#176B55', primaryText: '#FFFFFF', muted: '#EEF1EF',
  mutedText: '#58655E', danger: '#9D453C', warning: '#FFF4DF', warningText: '#805317',
  input: '#FFFFFF',
};
const paletaEscura = {
  background: '#111714', surface: '#1B2420', text: '#F1F6F2', subtext: '#B7C5BC',
  border: '#3B4B42', primary: '#3EAA87', primaryText: '#07150F', muted: '#29342E',
  mutedText: '#D5DFD8', danger: '#FF9B8E', warning: '#47371C', warningText: '#FFE1A3',
  input: '#18211C',
};
const ajustarContraste = (paleta, temaEscuro) => temaEscuro
  ? { ...paleta, background: '#000000', surface: '#000000', text: '#FFFFFF', subtext: '#FFFFFF', border: '#FFFFFF', primary: '#FFFF00', primaryText: '#000000', muted: '#111111', mutedText: '#FFFFFF', input: '#000000', danger: '#FF7777', warning: '#292900', warningText: '#FFFF00' }
  : { ...paleta, background: '#FFFFFF', surface: '#FFFFFF', text: '#000000', subtext: '#111111', border: '#000000', primary: '#005A38', primaryText: '#FFFFFF', muted: '#EEEEEE', mutedText: '#000000', input: '#FFFFFF', danger: '#8A0000', warning: '#FFF2A8', warningText: '#000000' };

export function ProvedorDeAparencia({ children: elementosFilhos }) {
  const esquemaDoSistema = useColorScheme();
  const [preferencias, definirPreferencias] = useState({ mode: 'system', highContrast: false, largeText: false, voiceGuidance: false });
  const [preferenciasCarregadas, definirPreferenciasCarregadas] = useState(false);

  React.useEffect(() => {
    let componenteMontado = true;
    SecureStore.getItemAsync(CHAVE_DAS_PREFERENCIAS).then((preferenciasSalvas) => {
      if (!componenteMontado || !preferenciasSalvas) return;
      try { definirPreferencias((preferenciasAtuais) => ({ ...preferenciasAtuais, ...JSON.parse(preferenciasSalvas) })); } catch { /* Ignore old/corrupt preferencias. */ }
    }).catch(() => {}).finally(() => { if (componenteMontado) definirPreferenciasCarregadas(true); });
    return () => { componenteMontado = false; };
  }, []);

  const atualizarPreferencias = useCallback(async (alteracoes) => {
    const novasPreferencias = { ...preferencias, ...alteracoes };
    definirPreferencias(novasPreferencias);
    await SecureStore.setItemAsync(CHAVE_DAS_PREFERENCIAS, JSON.stringify(novasPreferencias));
  }, [preferencias]);
  const temaEscuro = preferencias.mode === 'dark' || (preferencias.mode === 'system' && esquemaDoSistema === 'dark');
  const paletaBase = temaEscuro ? paletaEscura : paletaClara;
  const cores = preferencias.highContrast ? ajustarContraste(paletaBase, temaEscuro) : paletaBase;
  const valorDoContexto = useMemo(() => ({ preferencias, atualizarPreferencias, temaEscuro, cores, preferenciasCarregadas }), [preferencias, atualizarPreferencias, temaEscuro, cores, preferenciasCarregadas]);
  return <contextoDeAparencia.Provider value={valorDoContexto}>{elementosFilhos}</contextoDeAparencia.Provider>;
}

export function usarAparencia() {
  const contexto = useContext(contextoDeAparencia);
  if (!contexto) throw new Error('usarAparencia precisa ser usado dentro de ProvedorDeAparencia.');
  return contexto;
}
