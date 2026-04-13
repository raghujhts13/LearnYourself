'use client';

/**
 * JournalView
 *
 * Continuous journal organized as chapters (classrooms) → sections (class sessions).
 * Each section header shows the class title + last-edited timestamp.
 * Each section body is an inline NotesEditor.
 *
 * Used both on the /journal page and inside the global FAB drawer.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { BookOpen, ChevronDown, ChevronRight, NotebookPen, Clock, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import dynamic from 'next/dynamic';
import {
  saveClassNote,
  loadAllClassNotes,
  type ClassNoteRecord,
} from '@/lib/utils/class-notes-storage';
import { emptyDoc } from '@/components/notes/notes-editor';
import { db } from '@/lib/utils/database';
import type { ClassroomRecord } from '@/lib/utils/database';

const NotesEditor = dynamic(
  () => import('@/components/notes/notes-editor').then((m) => m.NotesEditor),
  { ssr: false },
);

// ─── Types ────────────────────────────────────────────────────────────────────

interface StageEntry {
  id: string;
  name: string;
  classroomId: string;
  updatedAt: number;
  sessionDate?: number;
}

interface Chapter {
  classroom: ClassroomRecord;
  stages: StageEntry[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTimestamp(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Section component ────────────────────────────────────────────────────────

function JournalSection({
  stage,
  note,
  onSave,
  defaultOpen,
}: {
  stage: StageEntry;
  note: ClassNoteRecord | null;
  onSave: (stageId: string, classroomId: string, content: string) => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [content, setContent] = useState(note?.content ?? JSON.stringify(emptyDoc()));
  const [lastSaved, setLastSaved] = useState<number | null>(note?.updatedAt ?? null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync when external note data changes (e.g. after initial load)
  useEffect(() => {
    setContent(note?.content ?? JSON.stringify(emptyDoc()));
    setLastSaved(note?.updatedAt ?? null);
  }, [note?.stageId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = useCallback(
    (docJSON: string) => {
      setContent(docJSON);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        onSave(stage.id, stage.classroomId, docJSON);
        setLastSaved(Date.now());
      }, 500);
    },
    [stage.id, stage.classroomId, onSave],
  );

  return (
    <div id={`section-${stage.id}`} className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      {/* Section header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-800/60 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
      >
        {open ? (
          <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
        )}
        <NotebookPen className="w-3.5 h-3.5 text-violet-500 shrink-0" />
        <span className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
          {stage.name}
        </span>
        {lastSaved && (
          <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 shrink-0">
            <Clock className="w-3 h-3" />
            {formatTimestamp(lastSaved)}
          </span>
        )}
        {!lastSaved && (
          <span className="text-xs text-gray-300 dark:text-gray-600 italic shrink-0">No notes yet</span>
        )}
      </button>

      {/* Section body — editor */}
      {open && (
        <div className="min-h-[200px] bg-white dark:bg-gray-900">
          <NotesEditor
            value={content}
            onChange={handleChange}
            placeholder={`Write your notes for "${stage.name}"…`}
          />
        </div>
      )}
    </div>
  );
}

// ─── Chapter component ────────────────────────────────────────────────────────

function JournalChapter({
  chapter,
  noteMap,
  onSave,
  defaultOpen,
}: {
  chapter: Chapter;
  noteMap: Map<string, ClassNoteRecord>;
  onSave: (stageId: string, classroomId: string, content: string) => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mb-6">
      {/* Chapter heading */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 mb-3 group"
      >
        <BookOpen className="w-4 h-4 text-violet-500 shrink-0" />
        <h2 className="flex-1 text-base font-bold text-gray-900 dark:text-gray-100 text-left">
          {chapter.classroom.name}
        </h2>
        <span className="text-xs text-gray-400 dark:text-gray-500 mr-1">
          {chapter.stages.length} {chapter.stages.length === 1 ? 'class' : 'classes'}
        </span>
        {open ? (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400" />
        )}
      </button>
      <div className="h-px bg-violet-100 dark:bg-violet-900/30 mb-3" />

      {open && (
        <div className="space-y-3 pl-2">
          {chapter.stages.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-600 italic px-2">
              No classes in this classroom yet.
            </p>
          ) : (
            chapter.stages.map((stage, i) => (
              <JournalSection
                key={stage.id}
                stage={stage}
                note={noteMap.get(stage.id) ?? null}
                onSave={onSave}
                defaultOpen={i === 0}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── JournalView (main export) ────────────────────────────────────────────────

interface JournalViewProps {
  /** If provided, only show the chapter for this classroomId */
  classroomId?: string;
  compact?: boolean;
}

export function JournalView({ classroomId, compact = false }: JournalViewProps) {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [noteMap, setNoteMap] = useState<Map<string, ClassNoteRecord>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    load();
  }, [classroomId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true);
    try {
      const [classroomsRaw, stagesRaw, allNotes] = await Promise.all([
        classroomId
          ? db.classrooms.where('id').equals(classroomId).toArray()
          : db.classrooms.orderBy('updatedAt').reverse().toArray(),
        classroomId
          ? db.stages.where('classroomId').equals(classroomId).toArray()
          : db.stages.orderBy('updatedAt').reverse().toArray(),
        loadAllClassNotes(),
      ]);

      const map = new Map<string, ClassNoteRecord>(allNotes.map((n) => [n.stageId, n]));
      setNoteMap(map);

      const builtChapters: Chapter[] = classroomsRaw.map((classroom) => ({
        classroom,
        stages: stagesRaw
          .filter((s) => s.classroomId === classroom.id)
          .map((s) => ({
            id: s.id,
            name: s.name,
            classroomId: s.classroomId ?? classroom.id,
            updatedAt: map.get(s.id)?.updatedAt ?? s.updatedAt,
            sessionDate: s.sessionDate,
          }))
          .sort((a, b) => b.updatedAt - a.updatedAt),
      }));

      setChapters(builtChapters);
    } finally {
      setLoading(false);
    }
  }

  const handleSave = useCallback(
    async (stageId: string, cId: string, content: string) => {
      await saveClassNote(stageId, cId, content);
      setNoteMap((prev) => {
        const next = new Map(prev);
        const existing = next.get(stageId);
        next.set(stageId, {
          stageId,
          classroomId: cId,
          content,
          updatedAt: Date.now(),
          createdAt: existing?.createdAt ?? Date.now(),
        });
        return next;
      });
    },
    [],
  );

  const scrollToSection = (stageId: string) => {
    document.getElementById(`section-${stageId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const filteredChapters = search.trim()
    ? chapters
        .map((ch) => ({
          ...ch,
          stages: ch.stages.filter((s) =>
            s.name.toLowerCase().includes(search.toLowerCase()) ||
            ch.classroom.name.toLowerCase().includes(search.toLowerCase()),
          ),
        }))
        .filter((ch) => ch.stages.length > 0)
    : chapters;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-gray-400 dark:text-gray-600">
        Loading journal…
      </div>
    );
  }

  return (
    <div className={cn('flex h-full overflow-hidden', compact ? 'flex-col' : 'flex-row')}>
      {/* Left sidebar — only shown in non-compact mode */}
      {!compact && (
        <div className="w-56 shrink-0 border-r border-gray-200 dark:border-gray-700 overflow-y-auto bg-gray-50 dark:bg-gray-900/50 p-3 space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-600 mb-2 px-1">
            Chapters
          </p>
          {chapters.map((ch) => (
            <div key={ch.classroom.id} className="mb-3">
              <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 truncate px-1 mb-1">
                {ch.classroom.name}
              </p>
              {ch.stages.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => scrollToSection(s.id)}
                  className="w-full text-left text-xs text-gray-500 dark:text-gray-500 hover:text-violet-600 dark:hover:text-violet-400 truncate px-2 py-0.5 rounded hover:bg-white dark:hover:bg-gray-800 transition-colors flex items-center gap-1"
                >
                  {noteMap.has(s.id) && (
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />
                  )}
                  {s.name}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Main journal content */}
      <div className="flex-1 overflow-y-auto">
        {/* Search */}
        <div className="sticky top-0 z-10 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700 px-5 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search classes or classrooms…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-800 rounded-lg border border-transparent focus:border-violet-300 dark:focus:border-violet-700 outline-none text-gray-700 dark:text-gray-300"
            />
          </div>
        </div>

        <div className="p-5 space-y-2">
          {filteredChapters.length === 0 ? (
            <div className="text-center py-16">
              <BookOpen className="w-12 h-12 mx-auto text-gray-200 dark:text-gray-700 mb-3" />
              <p className="text-sm text-gray-400 dark:text-gray-600">
                {search ? 'No classes match your search.' : 'No classrooms yet. Create a classroom and add classes to start journaling.'}
              </p>
            </div>
          ) : (
            filteredChapters.map((ch, i) => (
              <JournalChapter
                key={ch.classroom.id}
                chapter={ch}
                noteMap={noteMap}
                onSave={handleSave}
                defaultOpen={i === 0}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
