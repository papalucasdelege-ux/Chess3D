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
            'Non-profit educational chess game by Jan Rom (jrom.eu/), creator of studentplatform.net, calctrain.studentplatform.net, and chess3d.studentplatform.net.',
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
          navigateFallbackDenylist: [/^\/api\//, /^\/ws$/, /^\/assets\//, /^\/voices\//],
          runtimeCaching: [
            {
              // Never cache authenticated or live API routes
              urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
              handler: 'NetworkOnly',
            },
            {
              // Voice clips & seduction soundtrack MP3s: cache for instant offline playback (with range requests for streaming)
              urlPattern: ({ url }) =>
                url.pathname.startsWith('/voices/') ||
                url.pathname === '/seduction.mp3' ||
                (url.pathname.startsWith('/assets/aistudio/') && url.pathname.endsWith('.mp3')),
              handler: 'CacheFirst',
              options: {
                cacheName: 'chessangel-voices-v4-0',
                rangeRequests: true,
                expiration: {
                  maxEntries: 260,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                  purgeOnQuotaError: true,
                },
                cacheableResponse: {
                  statuses: [200],
                },
              },
            },
            {
              // Chess Angel portrait MP4s: hold all ~76 videos (maxEntries: 150) with RangeRequestsPlugin so Android tablets NEVER evict or stall
              urlPattern: ({ url }) =>
                url.pathname.startsWith('/assets/aistudio/') && url.pathname.endsWith('.mp4'),
              handler: 'CacheFirst',
              options: {
                cacheName: 'chessangel-videos-v4-0',
                rangeRequests: true,
                expiration: {
                  maxEntries: 150,
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
                cacheName: 'chessangel-registry-v4-0',
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
                cacheName: 'chessangel-images-v4-0',
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
      // Ensures 100% of Chess Angel .mp4 videos (both angel_*.mp4 and builtin_*.mp4) in
      // public/assets/aistudio/ are registered in angel_video_map.json before bundling and copied cleanly into dist/.
      {
        name: 'sync-all-angel-media-on-build',
        apply: 'build' as const,
        buildStart(): void {
          try {
            const aistudioDir = path.resolve(__dirname, 'public/assets/aistudio');
            const voicesFemaleDir = path.resolve(__dirname, 'public/voices/female');
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

            // Prune any stale map references to deleted files FIRST so builtin_*.mp4 fallbacks can fill them
            for (const dict of [idleVariants, groups, cases, escapes]) {
              for (const [k, v] of Object.entries(dict)) {
                if (typeof v !== 'string') continue;
                const clean = v.split('?')[0];
                const fname = path.basename(clean);
                if (!fs.existsSync(path.join(aistudioDir, fname))) {
                  delete dict[k];
                  changed = true;
                } else if (v !== clean) {
                  dict[k] = clean;
                  changed = true;
                }
              }
            }
            for (const topKey of ['defaultSpeaking', 'mouseIdle', 'mouseIdleWake', 'dogRunVideo', 'danceStarsVideo'] as const) {
              const val = rawMap[topKey];
              if (typeof val === 'string') {
                const clean = val.split('?')[0];
                const fname = path.basename(clean);
                if (!fs.existsSync(path.join(aistudioDir, fname))) {
                  delete rawMap[topKey];
                  changed = true;
                } else if (val !== clean) {
                  rawMap[topKey] = clean;
                  changed = true;
                }
              }
            }

            const entries = fs
              .readdirSync(aistudioDir, { withFileTypes: true })
              .filter(
                (e) =>
                  e.isFile() &&
                  /\.(mp4|webm|mov|m4v)$/i.test(e.name) &&
                  !e.name.includes('.opt.') &&
                  !e.name.includes('.tmp'),
              )
              // Prefer custom angel_*.mp4 ahead of builtin_*.mp4 when both exist
              .sort((a, b) => {
                const aAngel = a.name.startsWith('angel_') ? 0 : 1;
                const bAngel = b.name.startsWith('angel_') ? 0 : 1;
                return aAngel - bAngel || a.name.localeCompare(b.name);
              });

            for (const entry of entries) {
              const full = path.join(aistudioDir, entry.name);
              const stat = fs.statSync(full);
              const cleanPath = `/assets/aistudio/${entry.name}`;
              if (videoSizes[cleanPath] !== stat.size) {
                videoSizes[cleanPath] = stat.size;
                changed = true;
              }

              const mAngel = /^angel_(idle|mouse_idle|special|default|group|case|escape)_([a-z0-9_]+)\.mp4$/i.exec(
                entry.name,
              );
              if (mAngel) {
                const kind = mAngel[1].toLowerCase();
                const key = mAngel[2].toLowerCase();
                if (kind === 'idle') {
                  const normKey = key === 'idle_listening' ? 'idle_1' : key;
                  if (!idleVariants[normKey]) {
                    idleVariants[normKey] = cleanPath;
                    changed = true;
                  }
                } else if (kind === 'mouse_idle') {
                  if (key === 'wake' && !rawMap.mouseIdleWake) {
                    rawMap.mouseIdleWake = cleanPath;
                    changed = true;
                  } else if (key !== 'wake' && !rawMap.mouseIdle) {
                    rawMap.mouseIdle = cleanPath;
                    changed = true;
                  }
                } else if (kind === 'special') {
                  if (key === 'dog_run' && !rawMap.dogRunVideo) {
                    rawMap.dogRunVideo = cleanPath;
                    changed = true;
                  } else if (key === 'dance_stars' && !rawMap.danceStarsVideo) {
                    rawMap.danceStarsVideo = cleanPath;
                    changed = true;
                  }
                } else if (kind === 'default' && !rawMap.defaultSpeaking) {
                  rawMap.defaultSpeaking = cleanPath;
                  changed = true;
                } else if (kind === 'group' && !groups[key]) {
                  groups[key] = cleanPath;
                  changed = true;
                } else if (kind === 'case' && !cases[key]) {
                  cases[key] = cleanPath;
                  changed = true;
                } else if (kind === 'escape' && !escapes[key]) {
                  escapes[key] = cleanPath;
                  changed = true;
                }
                continue;
              }

              const mBuiltin = /^builtin_([a-z0-9_]+)\.mp4$/i.exec(entry.name);
              if (mBuiltin) {
                const bKey = mBuiltin[1].toLowerCase();
                if (bKey === 'default_speaking') {
                  if (!rawMap.defaultSpeaking) {
                    rawMap.defaultSpeaking = cleanPath;
                    changed = true;
                  }
                } else if (bKey === 'mouse_idle_sleep') {
                  if (!rawMap.mouseIdle) {
                    rawMap.mouseIdle = cleanPath;
                    changed = true;
                  }
                } else if (bKey === 'mouse_wake_up') {
                  if (!rawMap.mouseIdleWake) {
                    rawMap.mouseIdleWake = cleanPath;
                    changed = true;
                  }
                } else if (bKey === 'dog_run') {
                  if (!rawMap.dogRunVideo) {
                    rawMap.dogRunVideo = cleanPath;
                    changed = true;
                  }
                } else if (bKey === 'dance_stars') {
                  if (!rawMap.danceStarsVideo) {
                    rawMap.danceStarsVideo = cleanPath;
                    changed = true;
                  }
                } else if (bKey.startsWith('idle_')) {
                  if (!idleVariants[bKey]) {
                    idleVariants[bKey] = cleanPath;
                    changed = true;
                  }
                } else if (bKey.startsWith('escape_')) {
                  const escKey = bKey.slice('escape_'.length);
                  if (!escapes[escKey]) {
                    escapes[escKey] = cleanPath;
                    changed = true;
                  }
                } else if (!cases[bKey]) {
                  cases[bKey] = cleanPath;
                  changed = true;
                }
              }
            }

            // Prune dead seductionAudioVariants whose .mp3 does not exist on disk
            const sedVariants = (rawMap.seductionAudioVariants as Record<string, string>) || {};
            for (const [k, v] of Object.entries(sedVariants)) {
              if (typeof v !== 'string') continue;
              const fname = path.basename(v.split('?')[0]);
              if (!fs.existsSync(path.join(voicesFemaleDir, fname))) {
                delete sedVariants[k];
                changed = true;
              }
            }
            rawMap.seductionAudioVariants = sedVariants;

            // Discover bundled soundtrack MP3 files (> 200KB, excluding short voice clips)
            const excludedMp3 = new Set(['seduction.mp3', 'seduction_6.mp3', 'thank_jan.mp3']);
            const mp3Entries = fs
              .readdirSync(aistudioDir, { withFileTypes: true })
              .filter(
                (e) =>
                  e.isFile() &&
                  /\.mp3$/i.test(e.name) &&
                  !excludedMp3.has(e.name.toLowerCase()) &&
                  !e.name.includes('.tmp'),
              )
              .sort((a, b) => {
                const aQueen = a.name.toLowerCase().includes('a_beautiful_queen') ? 0 : 1;
                const bQueen = b.name.toLowerCase().includes('a_beautiful_queen') ? 0 : 1;
                return aQueen - bQueen || a.name.localeCompare(b.name);
              });
            const discoveredMusicTracks: Array<{ id: string; title: string; url: string }> = [];
            for (const mp3 of mp3Entries) {
              const stat = fs.statSync(path.join(aistudioDir, mp3.name));
              if (stat.size < 200 * 1024) continue;
              const lower = mp3.name.toLowerCase();
              const title = lower.includes('a_beautiful_queen_and_her_infinite_re')
                ? "Queen's Infinite Reign"
                : lower.includes('chess_angle_rap') || lower.includes('chess_angel_rap')
                  ? 'Chess Angel Rap'
                  : mp3.name
                      .replace(/\.mp3$/i, '')
                      .replace(/_[0-9a-f]{8}$/i, '')
                      .replace(/[_-]+/g, ' ')
                      .replace(/\s+/g, ' ')
                      .trim()
                      .replace(/\b\w/g, (c) => c.toUpperCase())
                      .slice(0, 48) || 'Chess Angel Track';
              const id = mp3.name
                .replace(/\.mp3$/i, '')
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '_')
                .replace(/^_+|_+$/g, '');
              discoveredMusicTracks.push({
                id: id || 'chess_angel_track',
                title,
                url: `/assets/aistudio/${mp3.name}`,
              });
            }
            if (
              discoveredMusicTracks.length > 0 &&
              JSON.stringify(rawMap.musicTracks || []) !== JSON.stringify(discoveredMusicTracks)
            ) {
              rawMap.musicTracks = discoveredMusicTracks;
              changed = true;
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
          for (const rootFile of ['seduction.mp3', '_headers', '_redirects', 'robots.txt']) {
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
        apply: 'build' as const,
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
    esbuild: {
      legalComments: 'none' as const,
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
