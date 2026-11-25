import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { wifiBridgePlugin } from './server/wifi-bridge';

const desktopCsp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  'connect-src https://api.iconify.design https://api.simplesvg.com https://api.unisvg.com',
  "object-src 'none'",
  "base-uri 'none'",
].join('; ');

export default defineConfig(({ mode }) => ({
  plugins: [vue(), wifiBridgePlugin(), ...(mode === 'desktop' ? [{
    name: 'theia-desktop-csp',
    transformIndexHtml: () => [{
      tag: 'meta',
      attrs: { 'http-equiv': 'Content-Security-Policy', content: desktopCsp },
      injectTo: 'head-prepend' as const,
    }],
  }] : [])],
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
}));
