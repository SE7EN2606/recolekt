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
      devOptions: {
        enabled: true
      },
      // Include the new icons folder in the build assets
      includeAssets: ['favicon.ico', 'recolekt_icon.png', 'assets/icons/**/*.webp'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,jpg,json}'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/storage\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gcs-images-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      manifest: {
        id: '/?v=3',
        name: 'Recolekt',
        short_name: 'Recolekt',
        description: 'Your personal video organizer',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/assets/icons/android/android-launchericon-192-192.webp',
            sizes: '192x192',
            type: 'image/webp',
            purpose: 'any maskable'
          },
          {
            src: '/assets/icons/android/android-launchericon-512-512.webp',
            sizes: '512x512',
            type: 'image/webp',
            purpose: 'any maskable'
          },
          {
            src: '/assets/icons/ios/180.webp',
            sizes: '180x180',
            type: 'image/webp'
          }
        ]
      }
    })
  ],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
      '/gcs-proxy': {
        target: 'https://storage.googleapis.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/gcs-proxy/, ''),
      },
    },
  },
});