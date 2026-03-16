import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      // AI Studio (local dev)
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
      // Vertex AI (GCP)
      'process.env.USE_VERTEX': JSON.stringify(env.USE_VERTEX),
      'process.env.VERTEX_PROJECT': JSON.stringify(env.VERTEX_PROJECT),
      'process.env.VERTEX_LOCATION': JSON.stringify(env.VERTEX_LOCATION || 'us-central1'),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
