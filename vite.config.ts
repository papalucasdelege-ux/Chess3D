import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
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
              const versioned = `${cleanPath}?v=${Math.floor(stat.mtimeMs)}`;

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
          const rootSed = path.resolve(__dirname, 'public', 'seduction.mp3');
          if (fs.existsSync(rootSed)) {
            fs.copyFileSync(rootSed, path.resolve(distDir, 'seduction.mp3'));
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
