/**
 * POST /api/classroom/deploy-vercel
 *
 * Stages this project with a single published classroom (same payload as /publish),
 * runs `npx vercel deploy`, and returns a student /learn URL on the new deployment.
 *
 * Requires VERCEL_TOKEN on the machine running OpenMAIC (typically local/self-hosted).
 */

import { type NextRequest } from 'next/server';
import type { Stage, Scene } from '@/lib/types/stage';
import {
  persistPublishedClassroom,
  type AudioFilePayload,
  type MediaFilePayload,
} from '@/lib/server/persist-published-classroom';
import {
  copyProjectForVercelStaging,
  makeStagingDir,
  removeStagingDir,
  runVercelDeploy,
} from '@/lib/server/vercel-classroom-deploy';
import { apiSuccess, apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';

const log = createLogger('DeployVercel API');

export const runtime = 'nodejs';
export const maxDuration = 300;

interface DeployRequestBody {
  stage: Stage;
  scenes: Scene[];
  audioFiles?: AudioFilePayload[];
  mediaFiles?: MediaFilePayload[];
  includeMedia?: boolean;
}

export async function POST(req: NextRequest) {
  const token = process.env.VERCEL_TOKEN?.trim();
  if (!token) {
    return apiError(
      API_ERROR_CODES.MISSING_REQUIRED_FIELD,
      503,
      'VERCEL_TOKEN is not set on this server. Add it to .env.local to deploy classrooms to Vercel.',
    );
  }

  let stageId: string | undefined;
  let stagingDir: string | null = null;

  try {
    const body = (await req.json()) as DeployRequestBody;
    const { stage, scenes, audioFiles = [], mediaFiles = [], includeMedia = true } = body;

    if (!stage || !scenes) {
      return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'Missing stage or scenes');
    }

    stageId = stage.id;
    const classroomId = stage.id;

    stagingDir = await makeStagingDir();
    const projectRoot = process.cwd();

    log.info(`Staging Vercel deploy for classroom ${classroomId} at ${stagingDir}`);

    await copyProjectForVercelStaging(stagingDir, projectRoot);

    await persistPublishedClassroom({
      stage,
      scenes,
      audioFiles,
      mediaFiles,
      includeMedia,
      baseUrl: '',
      relativeUrls: true,
      cwd: stagingDir,
    });

    const deploymentUrl = await runVercelDeploy({
      projectRoot,
      stagingDir,
      token,
      classroomId,
    });

    const studentUrl = `${deploymentUrl}/learn/${classroomId}`;

    log.info(`Vercel deployment ready: ${studentUrl}`);

    return apiSuccess(
      {
        id: classroomId,
        url: studentUrl,
        deploymentUrl,
      },
      201,
    );
  } catch (err) {
    log.error(`Vercel deploy failed [stageId=${stageId ?? 'unknown'}]:`, err);
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to deploy classroom to Vercel',
      err instanceof Error ? err.message : String(err),
    );
  } finally {
    if (stagingDir) {
      await removeStagingDir(stagingDir).catch((e) => log.warn('Staging cleanup failed:', e));
    }
  }
}
