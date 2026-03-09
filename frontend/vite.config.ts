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
      includeAssets: ['favicon.ico', 'recolekt_icon.png', 'web-app-manifest-192x192.png', 'web-app-manifest-512x512.png'],
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
        id: '/?v=2',
        name: 'Recolekt',
        short_name: 'Recolekt',
        description: 'Your personal video organizer',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/?utm_source=pwa',
        icons: [
          {
            src: '/web-app-manifest-192x192.png?v=2',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/web-app-manifest-512x512.png?v=2',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
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