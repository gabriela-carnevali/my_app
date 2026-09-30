module.exports = {
  expo: {
    name: 'Transporte Escolar',
    slug: 'transporte-escolar',
    scheme: 'transporteescolar',
    plugins: [
      'expo-secure-store',
      [
        'expo-location',
        {
          locationAlwaysAndWhenInUsePermission: 'Permita o uso da localização para registrar e acompanhar a rota escolar, inclusive em segundo plano.',
          locationWhenInUsePermission: 'Permita o uso da localização para exibir a van no mapa da rota escolar.',
          isIosBackgroundLocationEnabled: true,
          isAndroidBackgroundLocationEnabled: true,
          isAndroidForegroundServiceEnabled: true,
        },
      ],
    ],
    ios: {
      bundleIdentifier: 'br.com.transporteescolar.app',
      supportsTablet: true,
      infoPlist: {
        UIBackgroundModes: ['location'],
      },
    },
    android: {
      package: 'br.com.transporteescolar.app',
      ...(process.env.GOOGLE_MAPS_ANDROID_API_KEY
        ? { config: { googleMaps: { apiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY } } }
        : {}),
      permissions: [
        'ACCESS_COARSE_LOCATION',
        'ACCESS_FINE_LOCATION',
        'ACCESS_BACKGROUND_LOCATION',
        'FOREGROUND_SERVICE',
        'FOREGROUND_SERVICE_LOCATION',
      ],
    },
  },
};
