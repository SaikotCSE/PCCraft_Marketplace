// PCCraft Marketplace — Vite configuration.
//
// Tailwind v4 is wired through `@tailwindcss/vite` (no postcss.config.js needed).
// Path aliases mirror §1.3.2 of the spec so imports stay clean across the codebase.
// The dev proxy forwards `/api/*` to the Django dev server so the React app can call
// the API without CORS gymnastics during local development.

import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// loadEnv() reads frontend/.env and exposes VITE_* vars on the third arg,
// so the proxy target respects the same .env the React code uses.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  const djangoTarget = env.VITE_DJANGO_PROXY || 'http://127.0.0.1:8765';

  return {
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@components': path.resolve(__dirname, 'src/components'),
      '@pages': path.resolve(__dirname, 'src/pages'),
      '@services': path.resolve(__dirname, 'src/services'),
      '@context': path.resolve(__dirname, 'src/context'),
      '@hooks': path.resolve(__dirname, 'src/hooks'),
      '@utils': path.resolve(__dirname, 'src/utils'),
      '@assets': path.resolve(__dirname, 'src/assets'),
      '@routes': path.resolve(__dirname, 'src/routes'),
      '@styles': path.resolve(__dirname, 'src/styles'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      // Forward every `/api/**` request to the Django dev server (port 8000 by default;
      // override with VITE_DJANGO_PORT in frontend/.env when needed).
      '/api': {
        target: djangoTarget,
        changeOrigin: true,
        secure: false,
      },
    },
  },
  };
});