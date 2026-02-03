import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';

export default defineConfig({
  plugins: [react(), svgr()],

  server: {
    port: 3000,
    host: true,

    /*
    ✅ CORRECT BACKEND PORT
    */
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true
      }
    }
  },

  build: {
    outDir: 'dist',
    sourcemap: true
  }
});
