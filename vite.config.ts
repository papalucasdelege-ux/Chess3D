import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  const appVersion = '4.7';
  const appBuildId = `4.7.0-${Date.now().toString(36)}`;

  return {
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
      __APP_BUILD_ID__: JSON.stringify(appBuildId),
    },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'favicon.ico',
          'favicon-16x16.png',
          'favicon-32x32.png',
          'favicon.png',
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
            'Play free 3D educational chess against ChessAngel (800–2400 Elo) with live 3D thinking trees, voiced coaching, and PGN analysis. Non-profit app by Jan Rom.',
          theme_color: '#000000',
          background_color: '#000000',
          display: 'standalone',
          orientation: 'any',
          start_url: '/',
          scope: '/',
          categories: ['education', 'games', 'board'],
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
          cacheId: 'chessangel-v4-7',
          // Precache app shell, 3D chess engine, and UI bundle (icons included via includeAssets above)
          globPatterns: ['**/*.{js,css,html,ico,woff,woff2}'],
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
              // Cache Udo's lightweight custom MP3 bark (fetched as a full ArrayBuffer/Audio asset)
              // so it plays reliably online and offline across desktop, mobile, and installed PWAs.
              urlPattern: ({ url }) => url.pathname === '/assets/aistudio/udo_bark.mp3',
              handler: 'NetworkFirst',
              options: {
                cacheName: 'chessangel-udo-bark-v4-7',
                networkTimeoutSeconds: 4,
                cacheableResponse: {
                  statuses: [200],
                },
              },
            },
            {
              // Stream Chess Angel MP4 videos and full soundtrack MP3s directly via native browser
              // HTTP 206 Partial Content Range requests (prevents Workbox RangeRequestsPlugin stalls
              // on Windows Chrome, Android Chrome, Safari/iOS, Firefox, and Edge).
              urlPattern: ({ url }) =>
                (url.pathname.startsWith('/assets/aistudio/') &&
                  (url.pathname.endsWith('.mp4') || url.pathname.endsWith('.mp3'))) ||
                url.pathname === '/seduction.mp3',
              handler: 'NetworkOnly',
            },
            {
              // Short voice clips under /voices/ (URL-stamped with ?v=<APP_BUILD_ID>)
              urlPattern: ({ url }) => url.pathname.startsWith('/voices/'),
              handler: 'CacheFirst',
              options: {
                cacheName: 'chessangel-voices-v4-7',
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
              // Keep video registry fresh online while remaining playable offline
              urlPattern: ({ url }) => url.pathname === '/assets/aistudio/angel_video_map.json',
              handler: 'NetworkFirst',
              options: {
                cacheName: 'chessangel-registry-v4-7',
                networkTimeoutSeconds: 3,
                cacheableResponse: {
                  statuses: [200],
                },
              },
            },
            {
              // Static art/emblem images (URL-stamped with ?v=<APP_BUILD_ID>)
              urlPattern: ({ url }) =>
                url.pathname.startsWith('/assets/aistudio/') &&
                /\.(png|jpg|jpeg|webp|svg)$/i.test(url.pathname),
              handler: 'CacheFirst',
              options: {
                cacheName: 'chessangel-images-v4-7',
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

            // Discover bundled soundtrack MP3 files (> 200KB, excluding short voice clips and superseded Angle_45923f8a.mp3)
            const excludedMp3 = new Set([
              'seduction.mp3',
              'seduction_6.mp3',
              'thank_jan.mp3',
              'angle_45923f8a.mp3',
              'udo_bark.mp3',
            ]);
            const rawMp3Candidates = fs
              .readdirSync(aistudioDir, { withFileTypes: true })
              .filter((e) => {
                if (!e.isFile() || !/\.mp3$/i.test(e.name)) return false;
                if (excludedMp3.has(e.name.toLowerCase()) || e.name.includes('.tmp')) return false;
                try {
                  return fs.statSync(path.join(aistudioDir, e.name)).size >= 200 * 1024;
                } catch {
                  return false;
                }
              });
            const isQueenTrack = (n: string) =>
              n.toLowerCase().includes('a_beautiful_queen_and_her_infinite_re');
            const isRapTrack = (n: string) => {
              const l = n.toLowerCase();
              return l.includes('chess_angle_rap') || l.includes('chess_angel_rap');
            };
            const isMeditationalTrack = (n: string) => {
              const l = n.toLowerCase();
              return l === 'meditational.mp3' || l.startsWith('meditational_');
            };
            const isDarkAngelTrack = (n: string) => {
              const l = n.toLowerCase();
              return l === 'dark_angel.mp3' || l.startsWith('dark_angel_') || l.includes('dark_angel');
            };
            const isAngelsAlgorythmTrack = (n: string) => {
              const l = n.toLowerCase();
              return (
                l === 'angels_algorythm.mp3' ||
                l.startsWith('angels_algorythm_') ||
                l.includes('angels_algorythm') ||
                l.includes('angels_algorithm')
              );
            };
            const isGregorianEnthropyTrack = (n: string) => {
              const l = n.toLowerCase();
              return (
                l === 'gregorian_enthropy.mp3' ||
                l.startsWith('gregorian_enthropy_') ||
                l === 'gregorian_entropy.mp3' ||
                l.startsWith('gregorian_entropy_')
              );
            };
            const isLaDameAuDamierTrack = (n: string) => {
              const l = n.toLowerCase();
              return (
                l === 'dame_au_damier.mp3' ||
                l.startsWith('dame_au_damier_') ||
                l === 'la_dame_au_damier.mp3' ||
                l.startsWith('la_dame_au_damier_')
              );
            };
            const isLegacyAngleFile = (n: string) => {
              const l = n.toLowerCase();
              return l === 'angle_45923f8a.mp3' || /^angle_[0-9a-f]{8}\.mp3$/.test(l);
            };
            const dedicatedAngelTrack = rawMp3Candidates
              .filter(
                (e) =>
                  !isQueenTrack(e.name) &&
                  !isRapTrack(e.name) &&
                  !isMeditationalTrack(e.name) &&
                  !isDarkAngelTrack(e.name) &&
                  !isAngelsAlgorythmTrack(e.name) &&
                  !isGregorianEnthropyTrack(e.name) &&
                  !isLaDameAuDamierTrack(e.name) &&
                  !isLegacyAngleFile(e.name),
              )
              .sort((a, b) => {
                const la = a.name.toLowerCase();
                const lb = b.name.toLowerCase();
                if (la === 'chess_angle_2f568dfd.mp3') return -1;
                if (lb === 'chess_angle_2f568dfd.mp3') return 1;
                if (la === 'chess_angel_theme.mp3') return -1;
                if (lb === 'chess_angel_theme.mp3') return 1;
                return (
                  fs.statSync(path.join(aistudioDir, b.name)).mtimeMs -
                  fs.statSync(path.join(aistudioDir, a.name)).mtimeMs
                );
              })[0];
            const mp3Entries = rawMp3Candidates
              .filter((e) => {
                if (dedicatedAngelTrack && isLegacyAngleFile(e.name)) return false;
                return true;
              })
              .sort((a, b) => {
                const rank = (name: string) => {
                  if (isQueenTrack(name)) return 0;
                  if (isRapTrack(name)) return 1;
                  if (dedicatedAngelTrack && name === dedicatedAngelTrack.name) return 2;
                  if (isLegacyAngleFile(name)) return 2;
                  if (isMeditationalTrack(name)) return 3;
                  if (isDarkAngelTrack(name)) return 4;
                  if (isAngelsAlgorythmTrack(name)) return 5;
                  if (isGregorianEnthropyTrack(name)) return 6;
                  if (isLaDameAuDamierTrack(name)) return 7;
                  return 8;
                };
                return rank(a.name) - rank(b.name) || a.name.localeCompare(b.name);
              });
            const discoveredMusicTracks: Array<{ id: string; title: string; url: string }> = [];
            const seenMusicIds = new Set<string>();
            for (const mp3 of mp3Entries) {
              const isChosenAngel =
                (dedicatedAngelTrack && mp3.name === dedicatedAngelTrack.name) ||
                (!dedicatedAngelTrack && isLegacyAngleFile(mp3.name));
              if (!isChosenAngel && mp3.name.toLowerCase() === 'chess_angel_theme.mp3') {
                continue;
              }
              const title = isQueenTrack(mp3.name)
                ? "Queen's Infinite Reign"
                : isRapTrack(mp3.name)
                  ? 'Chess Angel Rap'
                  : isChosenAngel
                    ? 'Chess Angel'
                    : isMeditationalTrack(mp3.name)
                      ? 'Meditational'
                      : isDarkAngelTrack(mp3.name)
                        ? 'Dark Angel'
                        : isAngelsAlgorythmTrack(mp3.name)
                          ? 'Angels Algorythm'
                          : isGregorianEnthropyTrack(mp3.name)
                            ? 'Gregorian Enthropy'
                            : isLaDameAuDamierTrack(mp3.name)
                              ? 'La Dame au Damier'
                              : mp3.name
                                  .replace(/\.mp3$/i, '')
                                  .replace(/_[0-9a-f]{8}$/i, '')
                                  .replace(/[_-]+/g, ' ')
                                  .replace(/\s+/g, ' ')
                                  .trim()
                                  .replace(/\b\w/g, (c) => c.toUpperCase())
                                  .slice(0, 48) || 'Chess Angel Track';
              const id = isQueenTrack(mp3.name)
                ? 'queen_infinite_reign'
                : isRapTrack(mp3.name)
                  ? 'chess_angel_rap'
                  : isChosenAngel
                    ? 'chess_angel_theme'
                    : isMeditationalTrack(mp3.name)
                      ? 'meditational'
                      : isDarkAngelTrack(mp3.name)
                        ? 'dark_angel'
                        : isAngelsAlgorythmTrack(mp3.name)
                          ? 'angels_algorythm'
                          : isGregorianEnthropyTrack(mp3.name)
                            ? 'gregorian_enthropy'
                            : isLaDameAuDamierTrack(mp3.name)
                              ? 'la_dame_au_damier'
                              : mp3.name
                                  .replace(/\.mp3$/i, '')
                                  .toLowerCase()
                                  .replace(/[^a-z0-9]+/g, '_')
                                  .replace(/^_+|_+$/g, '') || 'chess_angel_track';
              if (seenMusicIds.has(id)) continue;
              seenMusicIds.add(id);
              discoveredMusicTracks.push({
                id,
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

            // Prune any stale videoDurations entries whose .mp4 is no longer on disk
            const videoDurations = (rawMap.videoDurations as Record<string, number>) || {};
            for (const k of Object.keys(videoDurations)) {
              const fname = path.basename(k.split('?')[0]);
              if (!fs.existsSync(path.join(aistudioDir, fname))) {
                delete videoDurations[k];
                changed = true;
              }
            }

            if (changed) {
              rawMap.idleVariants = idleVariants;
              rawMap.groups = groups;
              rawMap.cases = cases;
              rawMap.escapes = escapes;
              rawMap.videoDurations = videoDurations;
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
          for (const rootFile of [
            'seduction.mp3',
            '_headers',
            '_redirects',
            'robots.txt',
            'sitemap.xml',
            'favicon.ico',
            'favicon-16x16.png',
            'favicon-32x32.png',
            'favicon.png',
            'apple-touch-icon.png',
            'pwa-192x192.png',
            'pwa-512x512.png',
            'pwa-maskable-512x512.png',
          ]) {
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
      // When watching is enabled, ignore Studio media & session writes so uploading/baking never reloads the preview.
      watch:
        process.env.DISABLE_HMR === 'true'
          ? null
          : {
              ignored: [
                '**/public/assets/aistudio/**',
                '**/public/voices/**',
                '**/dist/**',
                '**/.studio-sessions.json',
              ],
            },
    },
  };
});
