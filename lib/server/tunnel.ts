/**
 * Tunnel Manager
 *
 * Optionally exposes the local Next.js server to the internet via a tunnel so
 * classrooms created on a developer's machine can be shared with others.
 *
 * Controlled by env vars (configure in .env.local):
 *
 *   TUNNEL_PROVIDER=localtunnel  # localtunnel | ngrok | none (default: none)
 *   TUNNEL_PORT=3000             # defaults to PORT env or 3000
 *   TUNNEL_SUBDOMAIN=myschool   # optional — provider-specific persistent subdomain
 *   NGROK_AUTHTOKEN=xxx         # required for ngrok provider
 *
 * Packages are loaded dynamically so they are optional — install only what you use:
 *   pnpm add localtunnel         # for localtunnel
 *   pnpm add @ngrok/ngrok        # for ngrok
 *
 * The resolved tunnel URL is stored in globalThis via public-url.ts and returned
 * by GET /api/public-url for the share dialog.
 */

import { createLogger } from '@/lib/logger';
import { setTunnelUrl } from './public-url';

const log = createLogger('Tunnel');

/**
 * Require an optional package without letting Next.js/webpack statically
 * trace the import. `new Function` is opaque to the bundler so the module
 * name is never seen at build time — the real Node.js `require` resolves it
 * at runtime instead.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function requireOptional<T = any>(packageName: string): T {
  // eslint-disable-next-line no-new-func, @typescript-eslint/no-require-imports
  return new Function('req', 'pkg', 'return req(pkg)')(require, packageName) as T;
}

type TunnelProvider = 'localtunnel' | 'ngrok' | 'none';

function getConfig(): { provider: TunnelProvider; port: number; subdomain?: string } {
  const provider = (process.env.TUNNEL_PROVIDER || 'none') as TunnelProvider;
  const port = parseInt(process.env.TUNNEL_PORT || process.env.PORT || '3000', 10);
  const subdomain = process.env.TUNNEL_SUBDOMAIN || undefined;
  return { provider, port, subdomain };
}

// ─── localtunnel ─────────────────────────────────────────────────────────────

async function startLocaltunnel(port: number, subdomain?: string): Promise<string> {
  // Dynamic import — optional dependency (name hidden from bundler via requireOptional)
  const localtunnel = requireOptional<(opts: {
    port: number;
    subdomain?: string;
  }) => Promise<{ url: string; on: (event: string, cb: (...args: unknown[]) => void) => void; close: () => void }>>('localtunnel');

  const tunnel = await localtunnel({ port, subdomain });
  log.info(`localtunnel started: ${tunnel.url}`);

  tunnel.on('close', () => {
    log.warn('localtunnel closed — share links may stop working');
    setTunnelUrl(null, null);
  });

  tunnel.on('error', (err: unknown) => {
    log.warn('localtunnel error:', err);
  });

  return tunnel.url;
}

// ─── ngrok ───────────────────────────────────────────────────────────────────

async function startNgrok(port: number, subdomain?: string): Promise<string> {
  const authToken = process.env.NGROK_AUTHTOKEN;
  if (!authToken) {
    throw new Error(
      'NGROK_AUTHTOKEN env var is required for ngrok tunnel. ' +
        'Get a free token at https://dashboard.ngrok.com/',
    );
  }

  // Dynamic import — optional dependency (name hidden from bundler via requireOptional)
  const ngrok = requireOptional<{
    connect: (opts: {
      addr: number;
      authtoken: string;
      domain?: string;
    }) => Promise<{ url: () => string; on: (event: string, cb: (...args: unknown[]) => void) => void }>;
  }>('@ngrok/ngrok');

  const listener = await ngrok.connect({
    addr: port,
    authtoken: authToken,
    ...(subdomain ? { domain: subdomain } : {}),
  });

  const url = listener.url();
  log.info(`ngrok started: ${url}`);

  listener.on('close', () => {
    log.warn('ngrok tunnel closed — share links may stop working');
    setTunnelUrl(null, null);
  });

  return url;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

/**
 * Start the configured tunnel provider.
 * Called once from instrumentation.ts at server startup.
 * Safe to call multiple times — no-ops after the first successful start.
 */
export async function startTunnel(): Promise<void> {
  const { provider, port, subdomain } = getConfig();

  if (provider === 'none') {
    log.info('No tunnel configured (TUNNEL_PROVIDER=none)');
    return;
  }

  // Don't tunnel in known cloud environments (they already have public URLs)
  const isCloud =
    process.env.VERCEL ||
    process.env.RAILWAY_ENVIRONMENT ||
    process.env.FLY_APP_NAME ||
    process.env.RENDER_EXTERNAL_URL ||
    process.env.PUBLIC_URL;

  if (isCloud) {
    log.info(`Running in cloud environment — skipping tunnel (provider=${provider})`);
    return;
  }

  log.info(`Starting ${provider} tunnel on port ${port}${subdomain ? ` (subdomain: ${subdomain})` : ''}...`);

  try {
    let url: string;
    if (provider === 'localtunnel') {
      url = await startLocaltunnel(port, subdomain);
      setTunnelUrl(url, 'tunnel-localtunnel');
    } else if (provider === 'ngrok') {
      url = await startNgrok(port, subdomain);
      setTunnelUrl(url, 'tunnel-ngrok');
    } else {
      log.warn(`Unknown TUNNEL_PROVIDER: "${provider}". Valid values: localtunnel, ngrok, none`);
      return;
    }

    log.info(`Tunnel active — public URL: ${url}`);
    log.info(`Share classrooms at: ${url}/classroom/<id>`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Cannot find module")) {
      log.warn(
        `Tunnel package not installed. Run: pnpm add ${provider === 'ngrok' ? '@ngrok/ngrok' : 'localtunnel'}`,
      );
    } else {
      log.error(`Failed to start ${provider} tunnel:`, err);
    }
    // Non-fatal — app still works, shares will use localhost URL
  }
}
