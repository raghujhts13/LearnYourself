'use client';

/**
 * ClassNotesPanel
 *
 * Right-side sliding panel for human-authored class notes.
 * One rich-text note document per class session (stageId).
 * Saves to IndexedDB automatically (debounced).
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { NotebookPen, ChevronRight, Clock, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import dynamic from 'next/dynamic';
import { saveClassNote, loadClassNote } from '@/lib/utils/class-notes-storage';
import { emptyDoc } from '@/components/notes/notes-editor';

const NotesEditor = dynamic(
  () => import('@/components/notes/notes-editor').then((m) => m.NotesEditor),
  { ssr: false },
);

interface ClassNotesPanelProps {
  stageId: string;
  classroomId: string;
  onClose: () => void;
}

type SaveStatus = 'idle' | 'saving' | 'saved';

function formatSaveTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function ClassNotesPanel({ stageId, classroomId, onClose }: ClassNotesPanelProps) {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load note on mount / stageId change
  useEffect(() => {
    setLoading(true);
    loadClassNote(stageId).then((record) => {
      setContent(record?.content ?? JSON.stringify(emptyDoc()));
      if (record?.updatedAt) setLastSaved(record.updatedAt);
      setLoading(false);
    });
  }, [stageId]);

  const handleChange = useCallback(
    (docJSON: string) => {
      setContent(docJSON);
      setSaveStatus('saving');
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        await saveClassNote(stageId, classroomId, docJSON);
        const now = Date.now();
        setLastSaved(now);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      }, 500);
    },
    [stageId, classroomId],
  );

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  return (
    <div className="flex flex-col w-80 shrink-0 border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 h-9 px-3 shrink-0 border-b border-gray-200/60 dark:border-gray-700/60 bg-white/90 dark:bg-gray-900/90">
        <NotebookPen className="w-3.5 h-3.5 text-violet-500 shrink-0" />
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 tracking-wide uppercase flex-1">
          My Notes
        </span>

        {/* Save indicator */}
        <div className="flex items-center gap-1 text-[10px] text-gray-400 dark:text-gray-500">
          {saveStatus === 'saving' && (
            <span className="animate-pulse">Saving…</span>
          )}
          {saveStatus === 'saved' && (
            <span className="flex items-center gap-0.5 text-green-500">
              <CheckCircle2 className="w-3 h-3" />
              Saved
            </span>
          )}
          {saveStatus === 'idle' && lastSaved && (
            <span className="flex items-center gap-0.5">
              <Clock className="w-3 h-3" />
              {formatSaveTime(lastSaved)}
            </span>
          )}
        </div>

        <button
          onClick={onClose}
          className="shrink-0 p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          title="Close notes"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-full text-xs text-gray-400 dark:text-gray-600">
            Loading…
          </div>
        ) : (
          <NotesEditor
            value={content}
            onChange={handleChange}
            placeholder="Write your notes for this class… (supports bold, italic, links, images)"
            className="h-full"
          />
        )}
      </div>
    </div>
  );
}
