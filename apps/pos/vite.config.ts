import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3025,
    proxy: {
      '/v1': {
        target: process.env.API_BASE_URL || 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
