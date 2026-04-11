/**
 * Classroom Publish API
 *
 * POST /api/classroom/publish
 *   Pushes a locally-created classroom (stage + scenes + optional blobs) from the
 *   teacher's browser to the server filesystem, making it accessible at a public URL.
 *
 * DELETE /api/classroom/publish?id=xxx
 *   Removes the published classroom JSON and all associated media/audio from disk.
 */

import { type NextRequest } from 'next/server';
import {
  buildRequestOrigin,
  isValidClassroomId,
  deleteClassroom,
} from '@/lib/server/classroom-storage';
import { getPublicBaseUrl } from '@/lib/server/public-url';
import { apiSuccess, apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';
import type { Stage, Scene } from '@/lib/types/stage';
import {
  persistPublishedClassroom,
  type AudioFilePayload,
  type MediaFilePayload,
} from '@/lib/server/persist-published-classroom';

const log = createLogger('Classroom Publish API');

// Next.js route body size — inherits the 200 MB proxy limit from next.config.ts
export const maxDuration = 120;

interface PublishRequestBody {
  stage: Stage;
  scenes: Scene[];
  audioFiles?: AudioFilePayload[];
  mediaFiles?: MediaFilePayload[];
  includeMedia?: boolean;
}

// ─── POST — publish ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let stageId: string | undefined;
  try {
    const body = (await req.json()) as PublishRequestBody;
    const { stage, scenes, audioFiles = [], mediaFiles = [], includeMedia = true } = body;

    if (!stage || !scenes) {
      return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'Missing stage or scenes');
    }

    stageId = stage.id;
    const classroomId = stage.id;
    const manualBaseUrl = req.nextUrl.searchParams.get('baseUrl');
    const baseUrl = manualBaseUrl
      ? manualBaseUrl.replace(/\/+$/, '')
      : getPublicBaseUrl(buildRequestOrigin(req));

    await persistPublishedClassroom({
      stage,
      scenes,
      audioFiles,
      mediaFiles,
      includeMedia,
      baseUrl,
      relativeUrls: false,
    });

    const url = `${baseUrl}/classroom/${classroomId}`;
    log.info(`Published classroom ${classroomId} → ${url}`);

    return apiSuccess({ id: classroomId, url }, 201);
  } catch (err) {
    log.error(`Publish failed [stageId=${stageId ?? 'unknown'}]:`, err);
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to publish classroom',
      err instanceof Error ? err.message : String(err),
    );
  }
}

// ─── DELETE — unpublish ───────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) {
      return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'Missing id parameter');
    }
    if (!isValidClassroomId(id)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid classroom id');
    }

    const deleted = await deleteClassroom(id);
    if (!deleted) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Classroom not found');
    }

    log.info(`Unpublished classroom: ${id}`);
    return apiSuccess({ id });
  } catch (err) {
    log.error('Unpublish failed:', err);
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to unpublish classroom',
      err instanceof Error ? err.message : String(err),
    );
  }
}
