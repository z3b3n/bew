import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.z3b3n.bew',
  appName: 'BEW',
  webDir: 'dist',
  ios: {
    contentInset: 'never',
    backgroundColor: '#0B0F17',
  },
  android: {
    backgroundColor: '#0B0F17',
  },
};

export default config;
