'use client';

import { useState, useEffect, useRef } from 'react';
import { StickyNote, ChevronDown, ChevronUp, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Scene } from '@/lib/types/stage';
import type { SpeechAction } from '@/lib/types/action';

interface SpeakerNotesPanelProps {
  readonly scene: Scene | null;
  /** The speech text currently being spoken (from PlaybackEngine) */
  readonly currentSpeech?: string | null;
  readonly onUpdateNotes: (sceneId: string, notes: string) => void;
  readonly collapsed?: boolean;
  readonly onCollapseChange?: (collapsed: boolean) => void;
}

/** Extract the list of speech paragraphs from a scene's actions */
function extractSpeeches(scene: Scene | null): string[] {
  if (!scene?.actions) return [];
  return scene.actions
    .filter((a): a is SpeechAction => a.type === 'speech')
    .map((a) => a.text);
}

/** Derive full speech text block for a scene (used as default notes) */
function extractSpeechText(scene: Scene | null): string {
  return extractSpeeches(scene).join('\n\n');
}

export function SpeakerNotesPanel({
  scene,
  currentSpeech,
  onUpdateNotes,
  collapsed = false,
  onCollapseChange,
}: SpeakerNotesPanelProps) {
  const [localNotes, setLocalNotes] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlightRef = useRef<HTMLDivElement | null>(null);

  // Sync notes when scene changes
  useEffect(() => {
    if (!scene) {
      setLocalNotes('');
      setIsEditing(false);
      return;
    }
    setLocalNotes(scene.speakerNotes ?? extractSpeechText(scene));
    setIsEditing(false);
  }, [scene?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll the active speech block into view whenever it changes
  useEffect(() => {
    if (highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [currentSpeech]);

  const handleChange = (value: string) => {
    setLocalNotes(value);
    if (!scene) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      onUpdateNotes(scene.id, value);
    }, 400);
  };

  // Determine if we're in "live playback" mode — show rich highlighted view
  const isPlaying = !!currentSpeech && !isEditing;

  // Build highlighted paragraphs for the live view.
  // Split the stored notes by double-newline to get individual blocks.
  const paragraphs = localNotes
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <div
      className={cn(
        'shrink-0 border-t border-gray-200/60 dark:border-gray-700/60',
        'bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm transition-all duration-300',
        collapsed ? 'h-9' : 'h-44',
      )}
    >
      {/* ── Panel header ── */}
      <div className="flex items-center gap-2 h-9 px-4 select-none">
        {/* Title — click to collapse/expand */}
        <div
          className="flex items-center gap-2 flex-1 cursor-pointer"
          onClick={() => onCollapseChange?.(!collapsed)}
        >
          <StickyNote className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 tracking-wide uppercase">
            Speaker Notes
          </span>
          {currentSpeech && !isEditing && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/30 text-[10px] font-medium text-violet-600 dark:text-violet-400">
              <span className="w-1 h-1 rounded-full bg-violet-500 animate-pulse" />
              Live
            </span>
          )}
          {scene && (
            <span className="text-[10px] text-gray-400 dark:text-gray-500 italic truncate max-w-[160px] ml-auto">
              {scene.title}
            </span>
          )}
        </div>

        {/* Edit / done toggle (only when not collapsed) */}
        {!collapsed && scene && (
          <button
            onClick={() => setIsEditing((v) => !v)}
            title={isEditing ? 'Done editing' : 'Edit notes'}
            className={cn(
              'shrink-0 p-1 rounded transition-colors',
              isEditing
                ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30'
                : 'text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400',
            )}
          >
            <Pencil className="w-3 h-3" />
          </button>
        )}

        <button
          onClick={() => onCollapseChange?.(!collapsed)}
          className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-400 transition-colors"
        >
          {collapsed ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* ── Body ── */}
      {!collapsed && (
        <div className="h-[calc(100%-36px)] overflow-hidden">
          {isPlaying ? (
            /* ── Live playback: rich highlighted paragraphs ── */
            <div className="h-full overflow-y-auto px-4 py-2 space-y-1.5">
              {paragraphs.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-gray-600 italic">
                  No notes for this slide.
                </p>
              ) : (
                paragraphs.map((para, i) => {
                  const isActive = currentSpeech
                    ? para.trim() === currentSpeech.trim() ||
                      currentSpeech.trim().startsWith(para.trim().slice(0, 40))
                    : false;
                  return (
                    <div
                      key={i}
                      ref={isActive ? highlightRef : null}
                      className={cn(
                        'text-sm leading-relaxed rounded-md px-2 py-1 transition-all duration-300',
                        isActive
                          ? 'bg-violet-100 dark:bg-violet-900/40 text-gray-900 dark:text-gray-100 font-medium ring-1 ring-violet-300 dark:ring-violet-700'
                          : 'text-gray-400 dark:text-gray-600',
                      )}
                    >
                      {para}
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            /* ── Edit mode: plain textarea ── */
            <textarea
              className={cn(
                'w-full h-full px-4 py-2 text-sm resize-none',
                'text-gray-700 dark:text-gray-300',
                'placeholder:text-gray-400 dark:placeholder:text-gray-600',
                'bg-transparent border-none outline-none',
              )}
              value={localNotes}
              onChange={(e) => handleChange(e.target.value)}
              placeholder={
                scene
                  ? 'Type speaker notes here, or leave empty to use the AI-generated speech script…'
                  : 'Select a slide to add speaker notes…'
              }
              disabled={!scene}
              spellCheck
            />
          )}
        </div>
      )}
    </div>
  );
}
