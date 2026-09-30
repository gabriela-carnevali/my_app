import React from 'react';
import { ProvedorDeAutenticacao } from './context/AuthContext.js';
import { ProvedorDeAparencia } from './context/AppearanceContext.js';
import { NavegadorDoAplicativo } from './navigation/AppNavigator.js';
import './hooks/useBackgroundTracking.js';

export default function Aplicativo() {
  return (
    <ProvedorDeAparencia>
      <ProvedorDeAutenticacao><NavegadorDoAplicativo /></ProvedorDeAutenticacao>
    </ProvedorDeAparencia>
  );
}
