import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist-mobile', assetsInlineLimit: 0, target: 'es2020' },
  worker: { format: 'es' },
});
