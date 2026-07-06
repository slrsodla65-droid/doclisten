import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.doclisten.mobile',
  appName: 'DocListen',
  webDir: 'mobile-shell',
  server: {
    url: 'https://doclisten.app',
    cleartext: false,
  },
  ios: {
    contentInset: 'automatic',
    scrollEnabled: true,
    limitsNavigationsToAppBoundDomains: false,
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#070a12',
      showSpinner: false,
    },
  },
};

export default config;
