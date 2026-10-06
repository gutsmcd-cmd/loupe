import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const MANIFEST_ID = '/loupe/'

function assertManifestId(): Plugin {
  return {
    name: 'assert-manifest-id',
    apply: 'build',
    enforce: 'post',
    closeBundle() {
      const file = resolve('dist/manifest.webmanifest')
      const manifest = JSON.parse(readFileSync(file, 'utf8')) as { id?: string }
      if (manifest.id !== MANIFEST_ID) {
        throw new Error(
          `manifest id must be ${MANIFEST_ID} (never './'), got ${String(manifest.id)}`,
        )
      }
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png'],
      manifest: {
        id: MANIFEST_ID,
        name: 'ルーペ',
        short_name: 'ルーペ',
        description: 'カメラで小さな文字を大きく見る。Read small print with your camera.',
        lang: 'ja',
        dir: 'ltr',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#f6f1e3',
        theme_color: '#1c3d32',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,woff2}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
    assertManifestId(),
  ],
})
