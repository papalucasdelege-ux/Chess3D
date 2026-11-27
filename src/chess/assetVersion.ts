/**
 * Build-stamped asset versioning so every published release automatically bypasses
 * stale browser HTTP caches, CDN caches, and older Service Worker caches for all
 * media assets (videos, MP3s, voice clips, and artwork).
 */
export const APP_VERSION: string =
  typeof __APP_VERSION__ === 'string' && __APP_VERSION__.length > 0 ? __APP_VERSION__ : '4.7';

export const APP_BUILD_ID: string =
  typeof __APP_BUILD_ID__ === 'string' && __APP_BUILD_ID__.length > 0
    ? __APP_BUILD_ID__
    : '4.7.0-dev';

/**
 * Appends (or replaces) the `?v=<APP_BUILD_ID>` query stamp on root-relative media URLs
 * (`/assets/aistudio/*`, `/voices/*`, `/seduction.mp3`, `/chess_angel_*`) while leaving
 * `blob:`, `data:`, and external URLs untouched.
 */
export function withAssetBuildVersion(url: string): string {
  if (!url) return url;
  if (
    url.startsWith('blob:') ||
    url.startsWith('data:') ||
    url.startsWith('http://') ||
    url.startsWith('https://')
  ) {
    return url;
  }
  const clean = url.split('?')[0];
  if (
    !clean.startsWith('/assets/aistudio/') &&
    !clean.startsWith('/voices/') &&
    clean !== '/seduction.mp3' &&
    !clean.startsWith('/chess_angel_')
  ) {
    return url;
  }
  // In dev mode, preserve any explicit `?v=<uploadTs>` set by live studio uploads so immediate preview reflects hot edits
  const qIdx = url.indexOf('?');
  if (import.meta.env.DEV && qIdx >= 0) {
    const existingParams = new URLSearchParams(url.slice(qIdx + 1));
    if (existingParams.has('v')) {
      return url;
    }
  }
  const params = qIdx >= 0 ? new URLSearchParams(url.slice(qIdx + 1)) : new URLSearchParams();
  params.set('v', APP_BUILD_ID);
  return `${clean}?${params.toString()}`;
}

export function stripAssetQuery(url: string): string {
  const idx = url.indexOf('?');
  return idx >= 0 ? url.slice(0, idx) : url;
}
