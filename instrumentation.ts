/**
 * Next.js Server Instrumentation
 *
 * This file runs once when the Next.js server starts (Node.js runtime only).
 * We use it to:
 *   - Start a local tunnel (localtunnel / ngrok) if TUNNEL_PROVIDER is set
 *   - Store the tunnel URL in globalThis so the publish API can use it
 *
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Only run in Node.js server context (not in Edge runtime or browser)
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // Standalone student deployments on Vercel — no tunnel
  if (process.env.NEXT_PUBLIC_OPENMAIC_STUDENT_SITE === '1') return;

  // Guard against multiple registrations (Next.js may call this per worker)
  if ((globalThis as Record<string, unknown>).__openmaicInstrumented) return;
  (globalThis as Record<string, unknown>).__openmaicInstrumented = true;

  // Start tunnel asynchronously — server startup is not blocked
  try {
    const { startTunnel } = await import('./lib/server/tunnel');
    // Fire-and-forget: tunnel start can take a few seconds
    startTunnel().catch((err) => {
      console.warn('[LYS] Tunnel start failed (non-fatal):', err?.message ?? err);
    });
  } catch {
    // Instrumentation must never crash the server
  }
}
