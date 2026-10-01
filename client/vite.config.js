import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  clearScreen: false,

  server: {
    host: process.env.VITE_HOST || undefined,
    port: 1420,
    strictPort: true,
    proxy: {
      '/health': { target: process.env.BACKEND_URL || 'http://localhost:8000' },
      '/ready': { target: process.env.BACKEND_URL || 'http://localhost:8000' },
      '/api': {
        target: process.env.BACKEND_URL || 'http://localhost:8000',
        changeOrigin: true,
      },
    },
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },

  build: {
    target: 'es2020',
    minify: 'terser',
    cssMinify: true,
    sourcemap: false,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 600,
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        passes: 2,
      },
      format: {
        comments: false,
      },
    },
  },
});
