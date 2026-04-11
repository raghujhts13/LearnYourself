/**
 * Session Export/Import Utilities
 *
 * Supports portable session files (.maic) containing all session data:
 * - Stage metadata
 * - All scenes with content and actions
 * - Associated audio files (TTS)
 * - Media files (generated images/videos)
 */

import { db } from './database';
import type { Stage, Scene } from '@/lib/types/stage';
import { createLogger } from '@/lib/logger';

const log = createLogger('SessionExport');

const SESSION_FILE_VERSION = 1;
const SESSION_FILE_EXTENSION = '.maic';

export interface SessionExportData {
  version: number;
  exportedAt: number;
  stage: Stage;
  scenes: Scene[];
  audioFiles: Array<{
    id: string;
    base64: string;
    format: string;
    text?: string;
    voice?: string;
    createdAt: number;
  }>;
  mediaFiles: Array<{
    id: string;
    stageId: string;
    type: 'image' | 'video';
    base64: string;
    mimeType: string;
    size: number;
    poster?: string; // base64
    prompt: string;
    params: string;
    error?: string;
    errorCode?: string;
    createdAt: number;
  }>;
}

/**
 * Convert a Blob to a base64 string.
 */
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Convert a base64 string back to a Blob.
 */
function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

/**
 * Export a session to a portable .maic file and trigger browser download.
 */
export async function exportSession(stageId: string): Promise<void> {
  log.info('Exporting session:', stageId);

  // Load stage
  const stageRecord = await db.stages.get(stageId);
  if (!stageRecord) throw new Error(`Stage not found: ${stageId}`);

  // Load scenes
  const sceneRecords = await db.scenes.where('stageId').equals(stageId).sortBy('order');

  // Load audio files referenced by scene actions
  const audioIds = new Set<string>();
  for (const scene of sceneRecords) {
    for (const action of scene.actions || []) {
      if ('audioId' in action && action.audioId) {
        audioIds.add(action.audioId as string);
      }
    }
  }
  const audioRecords = await db.audioFiles.bulkGet([...audioIds]);
  const audioFiles: SessionExportData['audioFiles'] = [];
  for (const record of audioRecords) {
    if (!record) continue;
    try {
      const base64 = await blobToBase64(record.blob);
      audioFiles.push({
        id: record.id,
        base64,
        format: record.format,
        text: record.text,
        voice: record.voice,
        createdAt: record.createdAt,
      });
    } catch (err) {
      log.warn('Failed to export audio file:', record.id, err);
    }
  }

  // Load media files
  const mediaRecords = await db.mediaFiles.where('stageId').equals(stageId).toArray();
  const mediaFiles: SessionExportData['mediaFiles'] = [];
  for (const record of mediaRecords) {
    if (record.error) {
      // Skip failed tasks
      continue;
    }
    try {
      const base64 = await blobToBase64(record.blob);
      let posterBase64: string | undefined;
      if (record.poster) {
        posterBase64 = await blobToBase64(record.poster);
      }
      mediaFiles.push({
        id: record.id,
        stageId: record.stageId,
        type: record.type,
        base64,
        mimeType: record.mimeType,
        size: record.size,
        poster: posterBase64,
        prompt: record.prompt,
        params: record.params,
        createdAt: record.createdAt,
      });
    } catch (err) {
      log.warn('Failed to export media file:', record.id, err);
    }
  }

  // Build stage object (maps StageRecord to Stage)
  const stage: Stage = {
    id: stageRecord.id,
    name: stageRecord.name,
    description: stageRecord.description,
    language: stageRecord.language || 'zh-CN',
    style: stageRecord.style || 'professional',
    createdAt: stageRecord.createdAt,
    updatedAt: stageRecord.updatedAt,
  };

  const exportData: SessionExportData = {
    version: SESSION_FILE_VERSION,
    exportedAt: Date.now(),
    stage,
    scenes: sceneRecords as unknown as Scene[],
    audioFiles,
    mediaFiles,
  };

  // Serialize and trigger download
  const json = JSON.stringify(exportData);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const filename = `${stageRecord.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}${SESSION_FILE_EXTENSION}`;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  log.info(
    `Session exported: ${filename} (${sceneRecords.length} scenes, ${audioFiles.length} audio, ${mediaFiles.length} media)`,
  );
}

/**
 * Import a session from a .maic file.
 * Returns the imported stageId on success.
 */
export async function importSession(file: File): Promise<string> {
  log.info('Importing session from file:', file.name);

  const text = await file.text();
  const data = JSON.parse(text) as SessionExportData;

  if (!data.version || !data.stage || !data.scenes) {
    throw new Error('Invalid session file format');
  }

  const { stage, scenes: importedScenes, audioFiles, mediaFiles } = data;

  // Check for existing session with same ID
  const existing = await db.stages.get(stage.id);
  if (existing) {
    // Assign a new ID to avoid collisions
    const { nanoid } = await import('nanoid');
    stage.id = nanoid(10);
    log.info('Session ID collision — reassigning to:', stage.id);
  }

  const now = Date.now();
  stage.updatedAt = now;

  // Save stage
  await db.stages.put({
    id: stage.id,
    name: stage.name,
    description: stage.description,
    language: stage.language,
    style: stage.style,
    createdAt: stage.createdAt || now,
    updatedAt: now,
  });

  // Save scenes (fix stageId references)
  for (const scene of importedScenes) {
    await db.scenes.put({
      ...scene,
      stageId: stage.id,
      createdAt: scene.createdAt || now,
      updatedAt: scene.updatedAt || now,
    } as Parameters<typeof db.scenes.put>[0]);
  }

  // Save audio files
  for (const audio of audioFiles || []) {
    try {
      const mimeType = `audio/${audio.format}`;
      const blob = base64ToBlob(audio.base64, mimeType);
      await db.audioFiles.put({
        id: audio.id,
        blob,
        format: audio.format,
        text: audio.text,
        voice: audio.voice,
        createdAt: audio.createdAt || now,
      });
    } catch (err) {
      log.warn('Failed to import audio file:', audio.id, err);
    }
  }

  // Save media files (update stageId if it was reassigned)
  for (const media of mediaFiles || []) {
    try {
      const blob = base64ToBlob(media.base64, media.mimeType);
      let posterBlob: Blob | undefined;
      if (media.poster) {
        posterBlob = base64ToBlob(media.poster, media.mimeType.startsWith('video/') ? 'image/jpeg' : media.mimeType);
      }
      // Update the compound ID if stageId was reassigned
      const newId = media.id.includes(':')
        ? `${stage.id}:${media.id.split(':').slice(1).join(':')}`
        : media.id;
      await db.mediaFiles.put({
        id: newId,
        stageId: stage.id,
        type: media.type,
        blob,
        mimeType: media.mimeType,
        size: media.size,
        poster: posterBlob,
        prompt: media.prompt,
        params: media.params,
        createdAt: media.createdAt || now,
      });
    } catch (err) {
      log.warn('Failed to import media file:', media.id, err);
    }
  }

  log.info(
    `Session imported: ${stage.name} (${importedScenes.length} scenes, ${(audioFiles || []).length} audio, ${(mediaFiles || []).length} media)`,
  );

  return stage.id;
}
