import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'favicon.png',
          'icon.svg',
          'apple-touch-icon.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png',
        ],
        manifest: {
          id: '/',
          name: 'ChessAngel 3D',
          short_name: 'ChessAngel',
          description:
            'Hand-carved 3D wooden Staunton chess with Chess Angel voice & video commentary, 3D search-tree lines, and hints.',
          theme_color: '#000000',
          background_color: '#000000',
          display: 'standalone',
          orientation: 'any',
          start_url: '/',
          scope: '/',
          categories: ['games', 'board', 'entertainment'],
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          // Precache app shell, 3D chess engine, UI bundle, and icons (keep initial install fast on mobile)
          globPatterns: ['**/*.{js,css,html,ico,svg,woff,woff2}', 'favicon.png', 'apple-touch-icon.png', 'pwa-*.png'],
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//, /^\/ws$/],
          runtimeCaching: [
            {
              // Never cache authenticated or live API routes
              urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
              handler: 'NetworkOnly',
            },
            {
              // Voice clips are small (~40-70 KB) and fetched as ArrayBuffers: cache on first play for offline speech
              urlPattern: ({ url }) =>
                url.pathname.startsWith('/voices/') || url.pathname === '/seduction.mp3',
              handler: 'CacheFirst',
              options: {
                cacheName: 'chessangel-voices-v3-3',
                expiration: {
                  maxEntries: 220,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                  purgeOnQuotaError: true,
                },
                cacheableResponse: {
                  statuses: [200],
                },
              },
            },
            {
              // Chess Angel portrait MP4s: use RangeRequestsPlugin so Android HTTP 206 Range streaming NEVER stalls
              urlPattern: ({ url }) =>
                url.pathname.startsWith('/assets/aistudio/') && url.pathname.endsWith('.mp4'),
              handler: 'CacheFirst',
              options: {
                cacheName: 'chessangel-videos-v3-3',
                rangeRequests: true,
                expiration: {
                  maxEntries: 45,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                  purgeOnQuotaError: true,
                },
                cacheableResponse: {
                  statuses: [200],
                },
              },
            },
            {
              // Keep video registry fresh online while remaining playable offline
              urlPattern: ({ url }) => url.pathname === '/assets/aistudio/angel_video_map.json',
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'chessangel-registry-v3-3',
                cacheableResponse: {
                  statuses: [200],
                },
              },
            },
            {
              // Static art/emblem images
              urlPattern: ({ url }) =>
                url.pathname.startsWith('/assets/aistudio/') &&
                /\.(png|jpg|jpeg|webp|svg)$/i.test(url.pathname),
              handler: 'CacheFirst',
              options: {
                cacheName: 'chessangel-images-v3-3',
                expiration: {
                  maxEntries: 40,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                  purgeOnQuotaError: true,
                },
                cacheableResponse: {
                  statuses: [200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
      // Ensures 100% of Chess Angel .mp4 videos in public/assets/aistudio/ are registered in
      // angel_video_map.json before bundling and copied cleanly into dist/ when Publish runs.
      {
        name: 'sync-all-angel-media-on-build',
        apply: 'build',
        buildStart(): void {
          try {
            const aistudioDir = path.resolve(__dirname, 'public/assets/aistudio');
            const mapPath = path.join(aistudioDir, 'angel_video_map.json');
            if (!fs.existsSync(aistudioDir)) return;

            const rawMap: Record<string, unknown> = fs.existsSync(mapPath)
              ? (JSON.parse(fs.readFileSync(mapPath, 'utf8')) as Record<string, unknown>)
              : {};

            const idleVariants = ((rawMap.idleVariants as Record<string, string>) || {});
            const groups = ((rawMap.groups as Record<string, string>) || {});
            const cases = ((rawMap.cases as Record<string, string>) || {});
            const escapes = ((rawMap.escapes as Record<string, string>) || {});
            const videoSizes = ((rawMap.videoSizes as Record<string, number>) || {});
            let changed = false;

            for (const entry of fs.readdirSync(aistudioDir, { withFileTypes: true })) {
              if (
                !entry.isFile() ||
                !/\.(mp4|webm|mov|m4v)$/i.test(entry.name) ||
                entry.name.includes('.opt.') ||
                entry.name.includes('.tmp')
              ) {
                continue;
              }
              const full = path.join(aistudioDir, entry.name);
              const stat = fs.statSync(full);
              const cleanPath = `/assets/aistudio/${entry.name}`;
              if (videoSizes[cleanPath] !== stat.size) {
                videoSizes[cleanPath] = stat.size;
                changed = true;
              }

              const m = /^angel_(idle|mouse_idle|default|group|case|escape)_([a-z0-9_]+)\.mp4$/i.exec(
                entry.name,
              );
              if (!m) continue;
              const kind = m[1].toLowerCase();
              const key = m[2].toLowerCase();
              const versioned = cleanPath;

              if (kind === 'idle') {
                const normKey = key === 'idle_listening' ? 'idle_1' : key;
                if (!idleVariants[normKey]) {
                  idleVariants[normKey] = versioned;
                  changed = true;
                }
              } else if (kind === 'mouse_idle') {
                if (key === 'wake' && !rawMap.mouseIdleWake) {
                  rawMap.mouseIdleWake = versioned;
                  changed = true;
                } else if (key !== 'wake' && !rawMap.mouseIdle) {
                  rawMap.mouseIdle = versioned;
                  changed = true;
                }
              } else if (kind === 'default' && !rawMap.defaultSpeaking) {
                rawMap.defaultSpeaking = versioned;
                changed = true;
              } else if (kind === 'group' && !groups[key]) {
                groups[key] = versioned;
                changed = true;
              } else if (kind === 'case' && !cases[key]) {
                cases[key] = versioned;
                changed = true;
              } else if (kind === 'escape' && !escapes[key]) {
                escapes[key] = versioned;
                changed = true;
              }
            }

            // Prune any stale map references to deleted files so published builds never hit 404
            for (const dict of [idleVariants, groups, cases, escapes]) {
              for (const [k, v] of Object.entries(dict)) {
                if (typeof v !== 'string') continue;
                const clean = v.split('?')[0];
                const fname = path.basename(clean);
                if (!fs.existsSync(path.join(aistudioDir, fname))) {
                  delete dict[k];
                  changed = true;
                }
              }
            }

            if (changed) {
              rawMap.idleVariants = idleVariants;
              rawMap.groups = groups;
              rawMap.cases = cases;
              rawMap.escapes = escapes;
              rawMap.videoSizes = videoSizes;
              fs.writeFileSync(mapPath, JSON.stringify(rawMap, null, 2), 'utf8');
            }
          } catch {
            // Continue build cleanly if source directory is read-only
          }
        },
        closeBundle(error?: Error): void {
          if (error) return;
          const distDir = path.resolve(__dirname, 'dist');
          if (!fs.existsSync(distDir)) return;
          for (const sub of ['assets', 'voices']) {
            const srcSub = path.resolve(__dirname, 'public', sub);
            const dstSub = path.resolve(distDir, sub);
            if (fs.existsSync(srcSub)) {
              fs.cpSync(srcSub, dstSub, { recursive: true, force: true });
            }
          }
          for (const rootFile of ['seduction.mp3', '_headers', '_redirects']) {
            const srcFile = path.resolve(__dirname, 'public', rootFile);
            if (fs.existsSync(srcFile)) {
              fs.copyFileSync(srcFile, path.resolve(distDir, rootFile));
            }
          }
        },
      },
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          const srcAssets = path.resolve(__dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, { recursive: true, force: true });
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      sourcemap: false,
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
