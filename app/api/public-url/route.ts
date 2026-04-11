/**
 * GET /api/public-url
 *
 * Returns the server's best-known externally-reachable base URL and metadata
 * about how it was detected. The share dialog calls this before publishing so
 * it can show the correct URL to the teacher and warn when the URL is local-only.
 */

import { type NextRequest } from 'next/server';
import { resolvePublicUrl } from '@/lib/server/public-url';
import { buildRequestOrigin } from '@/lib/server/classroom-storage';
import { apiSuccess } from '@/lib/server/api-response';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const requestOrigin = buildRequestOrigin(req);
  const info = resolvePublicUrl(requestOrigin);
  return apiSuccess({
    url: info.url,
    isLocal: info.isLocal,
    isTunneled: info.isTunneled,
    provider: info.provider,
    vercelDeployConfigured: Boolean(process.env.VERCEL_TOKEN?.trim()),
  });
}
