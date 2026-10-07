import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'com.fab.hexagrogne', appName: 'Hexagrogne', webDir: 'dist-mobile',
  android: { backgroundColor: '#0b1020' },
  plugins: { SystemBars: { insetsHandling: 'native', style: 'DARK' } },
};
export default config;
