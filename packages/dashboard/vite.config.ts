import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/auth': 'http://localhost:3000',
      '/intents': 'http://localhost:3000',
      '/events': 'http://localhost:3000',
      '/status': 'http://localhost:3000',
      '/alerts': 'http://localhost:3000',
    },
  },
});
