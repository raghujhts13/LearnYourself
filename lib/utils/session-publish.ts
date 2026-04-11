/**
 * Session Publish Utilities
 *
 * Pushes a locally-created classroom from IndexedDB to the self-hosted server,
 * making it accessible via a public URL (/classroom/:id).
 *
 * Audio and media blobs are sent as base64 when includeMedia is true, written
 * to data/classrooms/{id}/audio/ and data/classrooms/{id}/media/ on the server,
 * then surfaced as streaming URLs for visitors who lack local IndexedDB data.
 */

import { db } from './database';
import { setStagePublishedUrl } from './stage-storage';
import { createLogger } from '@/lib/logger';
import type { Stage, Scene } from '@/lib/types/stage';

const log = createLogger('SessionPublish');

export type ShareTarget = 'local' | 'vercel' | 'custom';

export interface PublishOptions {
  /** Include pre-generated TTS audio and media images in the published bundle. Default: true */
  includeMedia: boolean;
  /**
   * Override the base URL stamped into the published JSON (e.g. the teacher's public IP).
   * If omitted, the server auto-detects the best URL (tunnel > env > request origin).
   */
  baseUrlOverride?: string;
  /** Where to publish: this server (local/custom URL) or a new Vercel deployment. Default: local */
  shareTarget?: ShareTarget;
}

export interface PublishResult {
  id: string;
  url: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Publish a classroom from IndexedDB to the server.
 * Saves the returned URL back to the stage record in IndexedDB.
 *
 * @param stageId  The IndexedDB stage ID to publish
 * @param options  Publish options (includeMedia)
 */
export async function publishSession(
  stageId: string,
  options: PublishOptions = { includeMedia: true },
): Promise<PublishResult> {
  const shareTarget = options.shareTarget ?? 'local';
  log.info(
    `Publishing session ${stageId} (includeMedia=${options.includeMedia}, shareTarget=${shareTarget})`,
  );

  // ── Load stage ──────────────────────────────────────────────────────────────
  const stageRecord = await db.stages.get(stageId);
  if (!stageRecord) throw new Error(`Stage not found: ${stageId}`);

  const stage: Stage = {
    id: stageRecord.id,
    name: stageRecord.name,
    description: stageRecord.description,
    language: stageRecord.language || 'en-US',
    style: stageRecord.style || 'professional',
    createdAt: stageRecord.createdAt,
    updatedAt: stageRecord.updatedAt,
  };

  // ── Load scenes ─────────────────────────────────────────────────────────────
  const sceneRecords = await db.scenes.where('stageId').equals(stageId).sortBy('order');
  const scenes = sceneRecords as unknown as Scene[];

  // ── Collect referenced audio IDs ────────────────────────────────────────────
  const audioIds = new Set<string>();
  for (const scene of sceneRecords) {
    for (const action of scene.actions || []) {
      if ('audioId' in action && action.audioId) {
        audioIds.add(action.audioId as string);
      }
    }
  }

  // ── Build audio payload ─────────────────────────────────────────────────────
  type AudioPayload = { id: string; base64: string; format: string };
  const audioFiles: AudioPayload[] = [];
  if (options.includeMedia && audioIds.size > 0) {
    const records = await db.audioFiles.bulkGet([...audioIds]);
    for (const record of records) {
      if (!record) continue;
      try {
        const base64 = await blobToBase64(record.blob);
        audioFiles.push({ id: record.id, base64, format: record.format });
      } catch (err) {
        log.warn(`Failed to encode audio ${record.id}:`, err);
      }
    }
  }

  // ── Build media payload ─────────────────────────────────────────────────────
  type MediaPayload = { id: string; base64: string; mimeType: string; type: 'image' | 'video' };
  const mediaFiles: MediaPayload[] = [];
  if (options.includeMedia) {
    const records = await db.mediaFiles.where('stageId').equals(stageId).toArray();
    for (const record of records) {
      if (record.error) continue; // skip failed tasks
      try {
        const base64 = await blobToBase64(record.blob);
        mediaFiles.push({
          id: record.id,
          base64,
          mimeType: record.mimeType,
          type: record.type,
        });
      } catch (err) {
        log.warn(`Failed to encode media ${record.id}:`, err);
      }
    }
  }

  log.info(
    `Uploading: ${scenes.length} scenes, ${audioFiles.length} audio, ${mediaFiles.length} media`,
  );

  // ── POST to server ──────────────────────────────────────────────────────────
  const payload = {
    stage,
    scenes,
    audioFiles,
    mediaFiles,
    includeMedia: options.includeMedia,
  };

  let response: Response;
  if (shareTarget === 'vercel') {
    response = await fetch('/api/classroom/deploy-vercel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } else {
    const publishUrl = options.baseUrlOverride
      ? `/api/classroom/publish?baseUrl=${encodeURIComponent(options.baseUrlOverride)}`
      : '/api/classroom/publish';
    response = await fetch(publishUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || data.details || `Publish failed: HTTP ${response.status}`);
  }

  const data = await response.json();
  const result: PublishResult = { id: data.id, url: data.url };

  // ── Persist URL back to IndexedDB ──────────────────────────────────────────
  await setStagePublishedUrl(stageId, result.url);
  log.info(`Published: ${result.url}`);

  return result;
}

/**
 * Unpublish a classroom — removes the server copy and clears the publishedUrl
 * from IndexedDB.
 */
export async function unpublishSession(stageId: string): Promise<void> {
  log.info(`Unpublishing session ${stageId}`);

  const response = await fetch(`/api/classroom/publish?id=${encodeURIComponent(stageId)}`, {
    method: 'DELETE',
  });

  if (!response.ok && response.status !== 404) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Unpublish failed: HTTP ${response.status}`);
  }

  await setStagePublishedUrl(stageId, null);
  log.info(`Unpublished: ${stageId}`);
}
