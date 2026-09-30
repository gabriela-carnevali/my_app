import React from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet } from 'react-native';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import TelaDaRotaDoMotorista from '../screens/DriverRouteScreen.jsx';
import TelaInicial from '../screens/HomeScreen.jsx';
import TelaDeLogin from '../screens/LoginScreen.jsx';
import TelaDeNovoAluno from '../screens/NewStudentScreen.jsx';
import TelaDeEdicaoDoPercurso from '../screens/RouteEditorScreen.jsx';
import TelaDePermissoesAdministrativas from '../screens/AdminPermissionsScreen.jsx';
import TelaDeConfiguracoes from '../screens/SettingsScreen.jsx';
import { usarAutenticacao } from '../context/AuthContext.js';
import { usarAparencia } from '../context/AppearanceContext.js';

const PilhaDeTelas = createNativeStackNavigator();

export function NavegadorDoAplicativo() {
  const { sessao, carregando } = usarAutenticacao();
  const { cores, temaEscuro } = usarAparencia();
  const temaDeNavegacao = {
    ...(temaEscuro ? DarkTheme : DefaultTheme),
    colors: { ...(temaEscuro ? DarkTheme.colors : DefaultTheme.colors), primary: cores.primary, background: cores.background, card: cores.surface, text: cores.text, border: cores.border, notification: cores.danger },
  };

  if (carregando) {
    return (
      <SafeAreaView style={[estilos.carregando, { backgroundColor: cores.background }]}>
        <ActivityIndicator size="large" color={cores.primary} />
      </SafeAreaView>
    );
  }

  return (
    <NavigationContainer theme={temaDeNavegacao}>
      <PilhaDeTelas.Navigator key={sessao ? sessao.driver?.role ?? 'driver' : 'guest'} screenOptions={{ headerShown: false }}>
        {sessao
          ? <>
            <PilhaDeTelas.Screen name="Home" component={TelaInicial} />
            <PilhaDeTelas.Screen name="DriverRoute" component={TelaDaRotaDoMotorista} />
            <PilhaDeTelas.Screen name="RouteEditor" component={TelaDeEdicaoDoPercurso} />
            <PilhaDeTelas.Screen name="Settings" component={TelaDeConfiguracoes} />
            {sessao.driver?.role === 'admin' ? <>
              <PilhaDeTelas.Screen name="NewStudent" component={TelaDeNovoAluno} />
              <PilhaDeTelas.Screen name="AdminPermissions" component={TelaDePermissoesAdministrativas} />
            </> : null}
          </>
          : <>
            <PilhaDeTelas.Screen name="Login" component={TelaDeLogin} />
            <PilhaDeTelas.Screen name="Settings" component={TelaDeConfiguracoes} />
          </>}
      </PilhaDeTelas.Navigator>
    </NavigationContainer>
  );
}

export default NavegadorDoAplicativo;

const estilos = StyleSheet.create({ carregando: { flex: 1, alignItems: 'center', justifyContent: 'center' } });
