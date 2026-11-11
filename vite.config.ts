import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { wifiBridgePlugin } from './server/wifi-bridge';

export default defineConfig({
  plugins: [vue(), wifiBridgePlugin()],
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5173,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
