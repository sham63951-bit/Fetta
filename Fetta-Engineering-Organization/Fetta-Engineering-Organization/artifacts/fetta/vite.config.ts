import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext',
    },
  },
  build: {
    target: 'esnext',
    minify: 'esbuild',
  },
  server: {
    port: Number(process.env.PORT) || 3001,
    host: true,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: process.env.API_BASE_URL || 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
