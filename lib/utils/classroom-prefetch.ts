/**
 * Classroom Prefetch Utilities
 *
 * When a visitor loads a shared classroom from the server (no local IndexedDB
 * data), the published JSON contains `audioUrls` and `mediaUrls` maps that
 * point to files served from /api/classroom-media/...
 *
 * This module fetches those files and stores them in IndexedDB so the
 * existing audio player and media-generation store work without modification.
 */

import { db, mediaFileKey } from './database';
import { createLogger } from '@/lib/logger';

const log = createLogger('ClassroomPrefetch');

/**
 * Prefetch audio files from server URLs into IndexedDB.
 * Skips any audio IDs that already exist locally.
 *
 * @param audioUrls  Map of audioId → server URL
 */
export async function prefetchAudioFiles(audioUrls: Record<string, string>): Promise<void> {
  const ids = Object.keys(audioUrls);
  if (ids.length === 0) return;

  log.info(`Prefetching ${ids.length} audio file(s) from server`);

  await Promise.allSettled(
    ids.map(async (audioId) => {
      // Skip if already cached
      const existing = await db.audioFiles.get(audioId);
      if (existing) return;

      try {
        const url = audioUrls[audioId];
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const ext = url.split('.').pop()?.toLowerCase() || 'mp3';
        await db.audioFiles.put({
          id: audioId,
          blob,
          format: ext,
          createdAt: Date.now(),
        });
        log.info(`Cached audio: ${audioId}`);
      } catch (err) {
        log.warn(`Failed to prefetch audio ${audioId}:`, err);
      }
    }),
  );
}

/**
 * Prefetch media (image/video) files from server URLs into IndexedDB.
 * Skips any element IDs that already have a media record.
 *
 * @param stageId    The stage ID (needed for the compound media key)
 * @param mediaUrls  Map of elementId → server URL
 */
export async function prefetchMediaFiles(
  stageId: string,
  mediaUrls: Record<string, string>,
): Promise<void> {
  const elementIds = Object.keys(mediaUrls);
  if (elementIds.length === 0) return;

  log.info(`Prefetching ${elementIds.length} media file(s) from server`);

  await Promise.allSettled(
    elementIds.map(async (elementId) => {
      const recordId = mediaFileKey(stageId, elementId);

      // Skip if already cached
      const existing = await db.mediaFiles.get(recordId);
      if (existing) return;

      try {
        const url = mediaUrls[elementId];
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const mimeType = res.headers.get('content-type') || 'image/png';
        const type: 'image' | 'video' = mimeType.startsWith('video/') ? 'video' : 'image';

        await db.mediaFiles.put({
          id: recordId,
          stageId,
          type,
          blob,
          mimeType,
          size: blob.size,
          prompt: '',
          params: '{}',
          createdAt: Date.now(),
        });
        log.info(`Cached media: ${elementId}`);
      } catch (err) {
        log.warn(`Failed to prefetch media ${elementId}:`, err);
      }
    }),
  );
}
