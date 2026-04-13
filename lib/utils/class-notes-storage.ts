/**
 * Class Notes Storage
 *
 * CRUD helpers for the `classNotes` IndexedDB table.
 * Each class session (stage) has at most one rich-text note document.
 */

import { db, type ClassNoteRecord } from './database';
import { createLogger } from '@/lib/logger';

const log = createLogger('ClassNotesStorage');

export type { ClassNoteRecord };

/**
 * Save (upsert) a class note.
 * Creates a new record on first call; updates content + updatedAt on subsequent calls.
 */
export async function saveClassNote(
  stageId: string,
  classroomId: string,
  content: string,
): Promise<void> {
  try {
    const now = Date.now();
    const existing = await db.classNotes.get(stageId);
    await db.classNotes.put({
      stageId,
      classroomId,
      content,
      updatedAt: now,
      createdAt: existing?.createdAt ?? now,
    });
  } catch (error) {
    log.error('Failed to save class note:', error);
    throw error;
  }
}

/**
 * Load the note for a single class (stage). Returns null if none exists yet.
 */
export async function loadClassNote(stageId: string): Promise<ClassNoteRecord | null> {
  try {
    return (await db.classNotes.get(stageId)) ?? null;
  } catch (error) {
    log.error('Failed to load class note:', error);
    return null;
  }
}

/**
 * Load all notes for a classroom, sorted by updatedAt descending.
 */
export async function loadClassNotesByClassroom(
  classroomId: string,
): Promise<ClassNoteRecord[]> {
  try {
    const notes = await db.classNotes.where('classroomId').equals(classroomId).toArray();
    notes.sort((a, b) => b.updatedAt - a.updatedAt);
    return notes;
  } catch (error) {
    log.error('Failed to load classroom notes:', error);
    return [];
  }
}

/**
 * Load ALL class notes across all classrooms, sorted by updatedAt descending.
 */
export async function loadAllClassNotes(): Promise<ClassNoteRecord[]> {
  try {
    const notes = await db.classNotes.toArray();
    notes.sort((a, b) => b.updatedAt - a.updatedAt);
    return notes;
  } catch (error) {
    log.error('Failed to load all class notes:', error);
    return [];
  }
}

/**
 * Delete all notes for a classroom (used when classroom is deleted).
 */
export async function deleteClassNotesByClassroom(classroomId: string): Promise<void> {
  try {
    await db.classNotes.where('classroomId').equals(classroomId).delete();
  } catch (error) {
    log.error('Failed to delete classroom notes:', error);
    throw error;
  }
}
