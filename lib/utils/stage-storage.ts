/**
 * Stage Storage Manager
 *
 * Manages multiple stage data in IndexedDB
 * Each stage has its own storage key based on stageId
 */

import { Stage, Scene } from '../types/stage';
import { db, type FolderRecord } from './database';
import { clearPlaybackState, loadPlaybackState } from './playback-storage';
import { createLogger } from '@/lib/logger';
import { nanoid } from 'nanoid';

export type { FolderRecord };

const log = createLogger('StageStorage');

export interface StageStoreData {
  stage: Stage;
  scenes: Scene[];
  currentSceneId: string | null;
}

export interface StageListItem {
  id: string;
  name: string;
  description?: string;
  sceneCount: number;
  createdAt: number;
  updatedAt: number;
  /** Index of the last-saved scene (0-based). undefined if no saved progress. */
  lastSceneIndex?: number;
  /** URL of the published classroom on the server, if published */
  publishedUrl?: string;
  /** Folder this classroom belongs to, if any */
  folderId?: string;
}

/**
 * Save stage data to IndexedDB
 */
export async function saveStageData(stageId: string, data: StageStoreData): Promise<void> {
  try {
    const now = Date.now();

    // Preserve publishedUrl if already set
    const existing = await db.stages.get(stageId);

    // Save to stages table
    await db.stages.put({
      id: stageId,
      name: data.stage.name || 'Untitled Stage',
      description: data.stage.description,
      createdAt: data.stage.createdAt || now,
      updatedAt: now,
      language: data.stage.language,
      style: data.stage.style,
      currentSceneId: data.currentSceneId || undefined,
      publishedUrl: existing?.publishedUrl,
    });

    // Delete old scenes first to avoid orphaned data
    await db.scenes.where('stageId').equals(stageId).delete();

    // Save new scenes
    if (data.scenes && data.scenes.length > 0) {
      await db.scenes.bulkPut(
        data.scenes.map((scene, index) => ({
          ...scene,
          stageId,
          order: scene.order ?? index,
          createdAt: scene.createdAt || now,
          updatedAt: scene.updatedAt || now,
        })),
      );
    }

    log.info(`Saved stage: ${stageId}`);
  } catch (error) {
    log.error('Failed to save stage:', error);
    throw error;
  }
}

/**
 * Load stage data from IndexedDB
 */
export async function loadStageData(stageId: string): Promise<StageStoreData | null> {
  try {
    // Load stage
    const stage = await db.stages.get(stageId);
    if (!stage) {
      log.info(`Stage not found: ${stageId}`);
      return null;
    }

    // Load scenes
    const scenes = await db.scenes.where('stageId').equals(stageId).sortBy('order');

    log.info(`Loaded stage: ${stageId}, scenes: ${scenes.length}`);

    return {
      stage,
      scenes,
      currentSceneId: stage.currentSceneId || scenes[0]?.id || null,
    };
  } catch (error) {
    log.error('Failed to load stage:', error);
    return null;
  }
}

/**
 * Delete stage and all related data
 */
export async function deleteStageData(stageId: string): Promise<void> {
  try {
    // Delete stage
    await db.stages.delete(stageId);

    // Delete scenes
    await db.scenes.where('stageId').equals(stageId).delete();

    // Delete playback state
    await clearPlaybackState(stageId);

    log.info(`Deleted stage: ${stageId}`);
  } catch (error) {
    log.error('Failed to delete stage:', error);
    throw error;
  }
}

/**
 * List all stages
 */
export async function listStages(): Promise<StageListItem[]> {
  try {
    const stages = await db.stages.orderBy('updatedAt').reverse().toArray();

    const stageList: StageListItem[] = await Promise.all(
      stages.map(async (stage) => {
        const sceneCount = await db.scenes.where('stageId').equals(stage.id).count();
        const playback = await loadPlaybackState(stage.id);

        return {
          id: stage.id,
          name: stage.name,
          description: stage.description,
          sceneCount,
          createdAt: stage.createdAt,
          updatedAt: stage.updatedAt,
          lastSceneIndex: playback ? playback.sceneIndex : undefined,
          publishedUrl: stage.publishedUrl,
          folderId: stage.folderId,
        };
      }),
    );

    return stageList;
  } catch (error) {
    log.error('Failed to list stages:', error);
    return [];
  }
}

/**
 * Get first slide scene's canvas data for each stage (for thumbnail preview).
 * Also resolves gen_img_* placeholders from mediaFiles so thumbnails show real images.
 * Returns a map of stageId -> Slide (canvas data with resolved images)
 */
export async function getFirstSlideByStages(
  stageIds: string[],
): Promise<Record<string, import('../types/slides').Slide>> {
  const result: Record<string, import('../types/slides').Slide> = {};
  try {
    await Promise.all(
      stageIds.map(async (stageId) => {
        const scenes = await db.scenes.where('stageId').equals(stageId).sortBy('order');
        const firstSlide = scenes.find((s) => s.content?.type === 'slide');
        if (firstSlide && firstSlide.content.type === 'slide') {
          const slide = structuredClone(firstSlide.content.canvas);

          // Resolve gen_img_* placeholders from mediaFiles
          const placeholderEls = slide.elements.filter(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (el: any) => el.type === 'image' && /^gen_(img|vid)_[\w-]+$/i.test(el.src as string),
          );
          if (placeholderEls.length > 0) {
            const mediaRecords = await db.mediaFiles.where('stageId').equals(stageId).toArray();
            const mediaMap = new Map(
              mediaRecords.map((r) => {
                // Key format: stageId:elementId → extract elementId
                const elementId = r.id.includes(':') ? r.id.split(':').slice(1).join(':') : r.id;
                return [elementId, r.blob] as const;
              }),
            );
            for (const el of placeholderEls as Array<{ src: string }>) {
              const blob = mediaMap.get(el.src);
              if (blob) {
                el.src = URL.createObjectURL(blob);
              } else {
                // Clear unresolved placeholder so BaseImageElement won't subscribe
                // to the global media store (which may have stale data from another course)
                el.src = '';
              }
            }
          }

          result[stageId] = slide;
        }
      }),
    );
  } catch (error) {
    log.error('Failed to load thumbnails:', error);
  }
  return result;
}

/**
 * Rename a stage (updates only the name field in IndexedDB)
 */
export async function renameStage(stageId: string, newName: string): Promise<void> {
  try {
    await db.stages.update(stageId, { name: newName, updatedAt: Date.now() });
    log.info(`Renamed stage ${stageId} to "${newName}"`);
  } catch (error) {
    log.error('Failed to rename stage:', error);
    throw error;
  }
}

/**
 * Set or clear the publishedUrl for a stage
 */
export async function setStagePublishedUrl(stageId: string, url: string | null): Promise<void> {
  try {
    await db.stages.update(stageId, {
      publishedUrl: url ?? undefined,
      updatedAt: Date.now(),
    });
    log.info(`Updated publishedUrl for stage ${stageId}: ${url}`);
  } catch (error) {
    log.error('Failed to update publishedUrl:', error);
    throw error;
  }
}

/**
 * Check if stage exists
 */
export async function stageExists(stageId: string): Promise<boolean> {
  try {
    const stage = await db.stages.get(stageId);
    return !!stage;
  } catch (error) {
    log.error('Failed to check stage existence:', error);
    return false;
  }
}

// ─── Folder CRUD ──────────────────────────────────────────────────────────────

/**
 * List all folders ordered by name
 */
export async function listFolders(): Promise<FolderRecord[]> {
  try {
    const folders = await db.folders.orderBy('updatedAt').reverse().toArray();
    return folders;
  } catch (error) {
    log.error('Failed to list folders:', error);
    return [];
  }
}

/**
 * Create a new folder; returns the new folder id
 */
export async function createFolder(name: string): Promise<string> {
  const now = Date.now();
  const id = nanoid();
  await db.folders.add({ id, name, createdAt: now, updatedAt: now });
  log.info(`Created folder: ${id} "${name}"`);
  return id;
}

/**
 * Rename a folder
 */
export async function renameFolder(folderId: string, newName: string): Promise<void> {
  try {
    await db.folders.update(folderId, { name: newName, updatedAt: Date.now() });
    log.info(`Renamed folder ${folderId} to "${newName}"`);
  } catch (error) {
    log.error('Failed to rename folder:', error);
    throw error;
  }
}

/**
 * Delete a folder; classrooms inside it become uncategorized
 */
export async function deleteFolder(folderId: string): Promise<void> {
  try {
    await db.transaction('rw', [db.folders, db.stages], async () => {
      // Detach all classrooms from this folder first
      await db.stages.where('folderId').equals(folderId).modify({ folderId: undefined });
      await db.folders.delete(folderId);
    });
    log.info(`Deleted folder: ${folderId}`);
  } catch (error) {
    log.error('Failed to delete folder:', error);
    throw error;
  }
}

/**
 * Move a classroom into a folder, or pass null to remove it from all folders
 */
export async function moveStageToFolder(
  stageId: string,
  folderId: string | null,
): Promise<void> {
  try {
    await db.stages.update(stageId, {
      folderId: folderId ?? undefined,
      updatedAt: Date.now(),
    });
    log.info(`Moved stage ${stageId} to folder: ${folderId ?? 'none'}`);
  } catch (error) {
    log.error('Failed to move stage to folder:', error);
    throw error;
  }
}
