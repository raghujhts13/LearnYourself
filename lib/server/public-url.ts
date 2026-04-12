/**
 * Public URL Service
 *
 * Determines the externally-reachable base URL of this LYS server.
 * Used by the publish API to stamp correct shareable links into classroom JSON.
 *
 * Priority order:
 *   1. globalThis.__LYSTunnelUrl  — set by instrumentation.ts after tunnel starts
 *   2. PUBLIC_URL env var              — explicit manual override (highest static priority)
 *   3. Known cloud platform env vars  — Vercel, Railway, Fly.io, Render, Coolify, …
 *   4. Request origin fallback        — works for reverse-proxy setups, wrong for localhost
 *
 * Callers should use `resolvePublicUrl(requestOrigin)` which walks the chain above.
 */

export type UrlProvider =
  | 'tunnel-localtunnel'
  | 'tunnel-ngrok'
  | 'tunnel-custom'
  | 'manual'
  | 'vercel'
  | 'railway'
  | 'fly'
  | 'render'
  | 'coolify'
  | 'request-origin';

export interface PublicUrlInfo {
  /** The externally-reachable base URL (no trailing slash) */
  url: string;
  /** True if the URL points to localhost/127.0.0.1 — not shareable with others */
  isLocal: boolean;
  /** True if the URL was created by an active tunnel */
  isTunneled: boolean;
  /** Which detection path produced this URL */
  provider: UrlProvider;
}

// ─── Process-level tunnel URL (set by instrumentation / tunnel module) ────────
// Use globalThis so multiple Next.js module instances share the same value.
declare global {
  // eslint-disable-next-line no-var
  var __LYSTunnelUrl: string | null | undefined;
  // eslint-disable-next-line no-var
  var __LYSTunnelProvider: 'tunnel-localtunnel' | 'tunnel-ngrok' | 'tunnel-custom' | null | undefined;
}

export function getTunnelUrl(): string | null {
  return globalThis.__LYSTunnelUrl ?? null;
}

export function setTunnelUrl(
  url: string | null,
  provider: 'tunnel-localtunnel' | 'tunnel-ngrok' | 'tunnel-custom' | null,
): void {
  globalThis.__LYSTunnelUrl = url;
  globalThis.__LYSTunnelProvider = provider;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isLocalUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('172.')
    );
  } catch {
    return false;
  }
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

// ─── Platform detection ───────────────────────────────────────────────────────

function detectPlatformUrl(): { url: string; provider: UrlProvider } | null {
  const env = process.env;

  // 1. Manual override — highest priority for static config
  if (env.PUBLIC_URL) {
    return { url: stripTrailingSlash(env.PUBLIC_URL), provider: 'manual' };
  }

  // 2. Vercel — VERCEL_URL is injected automatically (no https:// prefix)
  //    VERCEL_PROJECT_PRODUCTION_URL is the stable production domain if set
  if (env.VERCEL) {
    const host = env.VERCEL_PROJECT_PRODUCTION_URL || env.VERCEL_URL;
    if (host) return { url: `https://${host}`, provider: 'vercel' };
  }

  // 3. Railway — RAILWAY_PUBLIC_DOMAIN or RAILWAY_STATIC_URL
  if (env.RAILWAY_ENVIRONMENT || env.RAILWAY_SERVICE_NAME) {
    const domain = env.RAILWAY_PUBLIC_DOMAIN || env.RAILWAY_STATIC_URL;
    if (domain) {
      const url = domain.startsWith('http') ? domain : `https://${domain}`;
      return { url: stripTrailingSlash(url), provider: 'railway' };
    }
  }

  // 4. Fly.io — FLY_APP_NAME
  if (env.FLY_APP_NAME) {
    return { url: `https://${env.FLY_APP_NAME}.fly.dev`, provider: 'fly' };
  }

  // 5. Render — RENDER_EXTERNAL_URL
  if (env.RENDER_EXTERNAL_URL) {
    return { url: stripTrailingSlash(env.RENDER_EXTERNAL_URL), provider: 'render' };
  }

  // 6. Coolify — COOLIFY_APP_ID injects APP_DOMAIN or custom env
  if (env.COOLIFY_APP_ID && env.APP_DOMAIN) {
    const url = env.APP_DOMAIN.startsWith('http') ? env.APP_DOMAIN : `https://${env.APP_DOMAIN}`;
    return { url: stripTrailingSlash(url), provider: 'coolify' };
  }

  return null;
}

// ─── Main exported function ───────────────────────────────────────────────────

/**
 * Resolve the best public base URL for this server instance.
 *
 * @param requestOrigin  Fallback: the origin extracted from the incoming HTTP request
 */
export function resolvePublicUrl(requestOrigin: string): PublicUrlInfo {
  // 1. Tunnel URL (set by instrumentation at startup)
  const tunnelUrl = getTunnelUrl();
  if (tunnelUrl) {
    return {
      url: tunnelUrl,
      isLocal: false,
      isTunneled: true,
      provider: globalThis.__LYSTunnelProvider ?? 'tunnel-custom',
    };
  }

  // 2. Platform / manual env vars
  const platform = detectPlatformUrl();
  if (platform) {
    return {
      url: platform.url,
      isLocal: isLocalUrl(platform.url),
      isTunneled: false,
      provider: platform.provider,
    };
  }

  // 3. Request origin fallback
  const url = stripTrailingSlash(requestOrigin);
  return {
    url,
    isLocal: isLocalUrl(url),
    isTunneled: false,
    provider: 'request-origin',
  };
}

/**
 * Convenience: return just the URL string for stamping into JSON / building links.
 */
export function getPublicBaseUrl(requestOrigin: string): string {
  return resolvePublicUrl(requestOrigin).url;
}
