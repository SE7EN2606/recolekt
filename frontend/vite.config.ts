import path from "path";
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: true },
      includeAssets: [
        'favicon.ico',
        'apple-touch-icon.png',
        'favicon-96x96.png'
      ],
      workbox: {
        cleanupOutdatedCaches: true,
        // Exclude large images from precache — only cache app shell
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
        globIgnores: [
          '**/assets/recolekt_logo_black*',
          '**/assets/rekolekt_logo_white*',
          '**/assets/recolekt_logo_white*',
          '**/*.webp',
        ],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024, // 3MB cap per file
        navigateFallback: '/index.html',
        navigateFallbackAllowlist: [/^\/(?!legal).*/],
      },
      manifest: {
        id: '/?v=27',
        name: 'Recolekt',
        short_name: 'Recolekt',
        description: 'Your personal video organizer',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/android-chrome-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/android-chrome-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
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