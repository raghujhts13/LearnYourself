/**
 * Shared logic for writing a published classroom (JSON + optional audio/media files).
 * Used by /api/classroom/publish and /api/classroom/deploy-vercel staging.
 */

import { promises as fs } from 'fs';
import path from 'path';
import type { Stage, Scene } from '@/lib/types/stage';
import { ensureClassroomsDir, getClassroomsRoot, writeJsonFileAtomic } from '@/lib/server/classroom-storage';
import { createLogger } from '@/lib/logger';

const log = createLogger('PersistPublishedClassroom');

export interface AudioFilePayload {
  id: string;
  base64: string;
  format: string;
}

export interface MediaFilePayload {
  id: string;
  base64: string;
  mimeType: string;
  type: 'image' | 'video';
}

export interface PersistPublishedClassroomParams {
  stage: Stage;
  scenes: Scene[];
  audioFiles?: AudioFilePayload[];
  mediaFiles?: MediaFilePayload[];
  includeMedia?: boolean;
  /**
   * Public origin with no trailing slash (e.g. https://example.com).
   * When relativeUrls is true, media URLs are rooted at `/api/...` instead.
   */
  baseUrl: string;
  relativeUrls?: boolean;
  /** Project root containing data/classrooms (default: process.cwd()). */
  cwd?: string;
}

function base64ToBuffer(base64: string): Buffer {
  return Buffer.from(base64, 'base64');
}

function mimeToExt(mimeType: string): string {
  const map: Record<string, string> = {
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
    'audio/aac': 'aac',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
  };
  return map[mimeType] ?? mimeType.split('/')[1] ?? 'bin';
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * Build absolute URL prefix for classroom media, or `/api/...` paths when relativeUrls.
 */
function mediaUrl(
  classroomId: string,
  kind: 'audio' | 'media',
  filename: string,
  baseUrl: string,
  relativeUrls: boolean,
): string {
  const suffix = `/api/classroom-media/${classroomId}/${kind}/${filename}`;
  if (relativeUrls) return suffix;
  const origin = stripTrailingSlash(baseUrl);
  return `${origin}${suffix}`;
}

export async function persistPublishedClassroom(
  params: PersistPublishedClassroomParams,
): Promise<{ classroomId: string }> {
  const {
    stage,
    scenes,
    audioFiles = [],
    mediaFiles = [],
    includeMedia = true,
    baseUrl,
    relativeUrls = false,
    cwd = process.cwd(),
  } = params;

  const classroomId = stage.id;
  const root = getClassroomsRoot(cwd);

  const audioUrls: Record<string, string> = {};
  const mediaUrls: Record<string, string> = {};

  if (includeMedia) {
    const audioDir = path.join(root, classroomId, 'audio');
    await fs.mkdir(audioDir, { recursive: true });

    for (const audio of audioFiles) {
      try {
        const ext = audio.format || 'mp3';
        const filename = `${audio.id}.${ext}`;
        const filePath = path.join(audioDir, filename);
        await fs.writeFile(filePath, base64ToBuffer(audio.base64));
        audioUrls[audio.id] = mediaUrl(classroomId, 'audio', filename, baseUrl, relativeUrls);
        log.info(`Wrote audio: ${filename}`);
      } catch (err) {
        log.warn(`Failed to write audio ${audio.id}:`, err);
      }
    }

    const mediaDir = path.join(root, classroomId, 'media');
    await fs.mkdir(mediaDir, { recursive: true });

    for (const media of mediaFiles) {
      try {
        const elementId = media.id.includes(':')
          ? media.id.split(':').slice(1).join(':')
          : media.id;
        const ext = mimeToExt(media.mimeType);
        const filename = `${elementId}.${ext}`;
        const filePath = path.join(mediaDir, filename);
        await fs.writeFile(filePath, base64ToBuffer(media.base64));
        mediaUrls[elementId] = mediaUrl(classroomId, 'media', filename, baseUrl, relativeUrls);
        log.info(`Wrote media: ${filename}`);
      } catch (err) {
        log.warn(`Failed to write media ${media.id}:`, err);
      }
    }
  }

  const enrichedClassroomData = {
    id: classroomId,
    stage: { ...stage, id: classroomId },
    scenes,
    audioUrls,
    mediaUrls,
    createdAt: new Date().toISOString(),
  };

  await ensureClassroomsDir(cwd);
  const jsonPath = path.join(root, `${classroomId}.json`);
  await writeJsonFileAtomic(jsonPath, enrichedClassroomData);

  log.info(`Persisted classroom ${classroomId} under ${root}`);
  return { classroomId };
}
