import path from "path";
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const googleMapsKey =
  process.env.VITE_GOOGLE_MAPS_API_KEY ||
  process.env.VITE_GOOGLE_MAPS_KEY ||
  process.env.VITE_GOOGLE_API_KEY ||
  '';

if (process.env.NODE_ENV === 'production' && !googleMapsKey) {
  throw new Error(
    'Missing VITE_GOOGLE_MAPS_API_KEY. Set it on the Railway frontend service/build environment.',
  );
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // PWA disabled during staging tester launch.
    // Old service-worker caches can keep stale auth bundles alive.
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          // React core
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // Maps (heavy)
          'vendor-leaflet': ['leaflet', 'react-leaflet'],
          // i18n
          'vendor-i18n': ['i18next', 'react-i18next'],
          // UI icons
          'vendor-icons': ['lucide-react'],
        },
      },
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': { target: 'http://localhost:5001', changeOrigin: true },
    },
  },
});