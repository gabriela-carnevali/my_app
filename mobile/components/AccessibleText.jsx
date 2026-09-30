import React from 'react';
import { Text as NativeText, StyleSheet } from 'react-native';
import { usarAparencia } from '../context/AppearanceContext.js';

export default function TextoAcessivel({ style: estiloRecebido, ...propriedades }) {
  const { preferencias } = usarAparencia();
  const estiloPlano = StyleSheet.flatten(estiloRecebido) ?? {};
  const fatorDeAmpliacao = preferencias.largeText ? 1.3 : 1;
  const estiloAjustado = preferencias.largeText
    ? { ...estiloPlano, fontSize: (estiloPlano.fontSize ?? 14) * fatorDeAmpliacao, lineHeight: estiloPlano.lineHeight ? estiloPlano.lineHeight * fatorDeAmpliacao : undefined }
    : estiloPlano;
  return <NativeText {...propriedades} style={estiloAjustado} />;
}
