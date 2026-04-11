'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  PanelLeftClose,
  PieChart,
  Cpu,
  // [INTERACTIVE DISABLED] MousePointer2,
  BookOpen,
  // [INTERACTIVE DISABLED] Globe,
  AlertCircle,
  RefreshCw,
  Trash2,
  Plus,
  Loader2,
  Sparkles,
  X,
  GripVertical,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThumbnailSlide } from '@/components/slide-renderer/components/ThumbnailSlide';
import { useStageStore, useCanvasStore } from '@/lib/store';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { SceneType, SlideContent } from '@/lib/types/stage';
import { PENDING_SCENE_ID } from '@/lib/store/stage';

interface SceneSidebarProps {
  readonly collapsed: boolean;
  readonly onCollapseChange: (collapsed: boolean) => void;
  readonly onSceneSelect?: (sceneId: string) => void;
  readonly onRetryOutline?: (outlineId: string) => Promise<void>;
  readonly onDeleteScene?: (sceneId: string) => void;
  readonly onAddAISlide?: (insertAfterOrder: number, title: string, type: SceneType) => Promise<{ success: boolean; error?: string }>;
}

// ─── Insert popover ────────────────────────────────────────────────────────────
function InsertSlidePopover({
  insertAfterOrder,
  onConfirm,
  onClose,
}: {
  insertAfterOrder: number;
  onConfirm: (title: string, type: SceneType) => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<SceneType>('slide');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    setError('');
    try {
      await onConfirm(title.trim(), type);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setLoading(false);
    }
  };

  const typeOptions: { value: SceneType; label: string; icon: React.ReactNode }[] = [
    { value: 'slide', label: 'Slide', icon: <BookOpen className="w-3 h-3" /> },
    { value: 'quiz', label: 'Quiz', icon: <PieChart className="w-3 h-3" /> },
    // [INTERACTIVE DISABLED] Interactive learning functionality is disabled
    // { value: 'interactive', label: 'Interactive', icon: <MousePointer2 className="w-3 h-3" /> },
  ];

  return (
    <div className="absolute left-full ml-2 top-0 z-50 w-64 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-purple-600 dark:text-purple-400">
          <Sparkles className="w-3.5 h-3.5" />
          <span className="text-xs font-bold">Add AI Slide</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-2">
        <input
          ref={inputRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Slide topic or title…"
          className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 placeholder:text-gray-400 outline-none focus:border-purple-400 dark:focus:border-purple-500 focus:ring-1 focus:ring-purple-300"
        />

        <div className="flex gap-1">
          {typeOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setType(opt.value)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1 text-[10px] font-semibold py-1 rounded-md transition-colors',
                type === opt.value
                  ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700',
              )}
            >
              {opt.icon}
              {opt.label}
            </button>
          ))}
        </div>

        {error && <p className="text-[10px] text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={!title.trim() || loading}
          className="w-full py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
        >
          {loading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5" />
              Generate
            </>
          )}
        </button>
      </form>
    </div>
  );
}

const DEFAULT_WIDTH = 220;
const MIN_WIDTH = 170;
const MAX_WIDTH = 400;

export function SceneSidebar({
  collapsed,
  onCollapseChange,
  onSceneSelect,
  onRetryOutline,
  onDeleteScene,
  onAddAISlide,
}: SceneSidebarProps) {
  const { t } = useI18n();
  const router = useRouter();
  const { scenes, currentSceneId, setCurrentSceneId, setScenes, generatingOutlines, generationStatus } =
    useStageStore();
  const failedOutlines = useStageStore.use.failedOutlines();
  const viewportSize = useCanvasStore.use.viewportSize();
  const viewportRatio = useCanvasStore.use.viewportRatio();

  const [retryingOutlineId, setRetryingOutlineId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  // insertAfterOrder: order of scene after which to insert, or -1 for before first
  const [insertAfterOrder, setInsertAfterOrder] = useState<number | null>(null);

  // ── Drag-to-reorder state ──────────────────────────────────────────────────
  const dragSceneIdRef = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  // 'above' = drop indicator shown above the target, 'below' = below
  const [dropPosition, setDropPosition] = useState<'above' | 'below'>('below');

  const handleSceneDragStart = useCallback((e: React.DragEvent, sceneId: string) => {
    dragSceneIdRef.current = sceneId;
    e.dataTransfer.effectAllowed = 'move';
    // Minimal ghost image so the cursor feedback looks clean
    const ghost = document.createElement('div');
    ghost.style.cssText = 'position:fixed;top:-999px;left:-999px;opacity:0;';
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    setTimeout(() => document.body.removeChild(ghost), 0);
  }, []);

  const handleSceneDragOver = useCallback((e: React.DragEvent, sceneId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    setDragOverId(sceneId);
    setDropPosition(e.clientY < midY ? 'above' : 'below');
  }, []);

  const handleSceneDrop = useCallback(
    (e: React.DragEvent, targetSceneId: string) => {
      e.preventDefault();
      const sourceId = dragSceneIdRef.current;
      dragSceneIdRef.current = null;
      setDragOverId(null);

      if (!sourceId || sourceId === targetSceneId) return;

      const sorted = [...scenes].sort((a, b) => a.order - b.order);
      const sourceIdx = sorted.findIndex((s) => s.id === sourceId);
      const targetIdx = sorted.findIndex((s) => s.id === targetSceneId);
      if (sourceIdx === -1 || targetIdx === -1) return;

      const reordered = sorted.filter((s) => s.id !== sourceId);
      const insertIdx =
        dropPosition === 'above'
          ? targetIdx > sourceIdx
            ? targetIdx - 1
            : targetIdx
          : targetIdx >= sourceIdx
            ? targetIdx
            : targetIdx + 1;

      reordered.splice(insertIdx, 0, sorted[sourceIdx]);
      const renumbered = reordered.map((s, i) => ({ ...s, order: i }));
      setScenes(renumbered);
    },
    [scenes, dropPosition, setScenes],
  );

  const handleSceneDragEnd = useCallback(() => {
    dragSceneIdRef.current = null;
    setDragOverId(null);
  }, []);

  const handleRetryOutline = async (outlineId: string) => {
    if (!onRetryOutline) return;
    setRetryingOutlineId(outlineId);
    try {
      await onRetryOutline(outlineId);
    } finally {
      setRetryingOutlineId(null);
    }
  };

  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH);
  const isDraggingRef = useRef(false);

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDraggingRef.current = true;
      const startX = e.clientX;
      const startWidth = sidebarWidth;

      const handleMouseMove = (me: MouseEvent) => {
        const delta = me.clientX - startX;
        const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + delta));
        setSidebarWidth(newWidth);
      };

      const handleMouseUp = () => {
        isDraggingRef.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [sidebarWidth],
  );

  const getSceneTypeIcon = (type: SceneType) => {
    const icons: Record<string, typeof BookOpen> = {
      slide: BookOpen,
      quiz: PieChart,
      // [INTERACTIVE DISABLED] interactive: MousePointer2,
      pbl: Cpu,
    };
    return icons[type] || BookOpen;
  };

  const displayWidth = collapsed ? 0 : sidebarWidth;

  return (
    <div
      style={{
        width: displayWidth,
        transition: isDraggingRef.current ? 'none' : 'width 0.3s ease',
      }}
      className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-r border-gray-100 dark:border-gray-800 shadow-[2px_0_24px_rgba(0,0,0,0.02)] flex flex-col shrink-0 z-20 relative overflow-visible"
    >
      {/* Drag handle */}
      {!collapsed && (
        <div
          onMouseDown={handleDragStart}
          className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize z-50 group hover:bg-purple-400/30 dark:hover:bg-purple-600/30 active:bg-purple-500/40 dark:active:bg-purple-500/40 transition-colors"
        >
          <div className="absolute right-0.5 top-1/2 -translate-y-1/2 w-0.5 h-8 rounded-full bg-gray-300 dark:bg-gray-600 group-hover:bg-purple-400 dark:group-hover:bg-purple-500 transition-colors" />
        </div>
      )}

      <div className={cn('flex flex-col w-full h-full overflow-hidden', collapsed && 'hidden')}>
        {/* Logo Header */}
        <div className="h-10 flex items-center justify-between shrink-0 relative mt-3 mb-1 px-3">
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-2 cursor-pointer rounded-lg px-1.5 -mx-1.5 py-1 -my-1 hover:bg-gray-100/80 dark:hover:bg-gray-800/60 active:scale-[0.97] transition-all duration-150"
            title={t('generation.backToHome')}
          >
            <img src="/lys-logo.png" alt="LYS" className="h-8 w-auto" />
          </button>
          <button
            onClick={() => onCollapseChange(true)}
            className="w-7 h-7 shrink-0 rounded-lg flex items-center justify-center bg-gray-100/80 dark:bg-gray-800/80 text-gray-500 dark:text-gray-400 ring-1 ring-black/[0.04] dark:ring-white/[0.06] hover:bg-gray-200/90 dark:hover:bg-gray-700/90 hover:text-gray-700 dark:hover:text-gray-200 active:scale-90 transition-all duration-200"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>

        {/* Scenes List */}
        <div
          data-testid="scene-list"
          className="flex-1 overflow-y-auto overflow-x-hidden p-2 scrollbar-hide pt-1"
        >
          {/* Insert at very beginning */}
          {onAddAISlide && (
            <div className="relative mb-1">
              {insertAfterOrder === -1 && (
                <InsertSlidePopover
                  insertAfterOrder={-1}
                  onConfirm={async (title, type) => {
                    const result = await onAddAISlide(-1, title, type);
                    if (!result.success) throw new Error(result.error);
                  }}
                  onClose={() => setInsertAfterOrder(null)}
                />
              )}
              <button
                type="button"
                onClick={() => setInsertAfterOrder(insertAfterOrder === -1 ? null : -1)}
                className="w-full flex items-center justify-center gap-1 py-0.5 rounded-md text-[10px] font-semibold text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors opacity-0 hover:opacity-100 focus:opacity-100 group"
                title="Add AI slide at beginning"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          )}

          {scenes.map((scene, index) => {
            const isActive = currentSceneId === scene.id;
            const Icon = getSceneTypeIcon(scene.type);
            const isSlide = scene.type === 'slide';
            const slideContent = isSlide ? (scene.content as SlideContent) : null;
            const isConfirmingDelete = confirmDeleteId === scene.id;

            const isDragTarget = dragOverId === scene.id;

            return (
              <div key={scene.id} className="space-y-1 mb-1">
              <div
                data-testid="scene-item"
                draggable
                onDragStart={(e) => handleSceneDragStart(e, scene.id)}
                onDragOver={(e) => handleSceneDragOver(e, scene.id)}
                onDrop={(e) => handleSceneDrop(e, scene.id)}
                onDragEnd={handleSceneDragEnd}
                onClick={() => {
                  if (isConfirmingDelete) return;
                  if (onSceneSelect) {
                    onSceneSelect(scene.id);
                  } else {
                    setCurrentSceneId(scene.id);
                  }
                }}
                className={cn(
                  'group relative rounded-lg transition-all duration-200 cursor-pointer flex flex-col gap-1 p-1.5',
                  isActive
                    ? 'bg-purple-50 dark:bg-purple-900/20 ring-1 ring-purple-200 dark:ring-purple-700'
                    : 'hover:bg-gray-50/80 dark:hover:bg-gray-800/50',
                  isConfirmingDelete && 'ring-1 ring-red-300 dark:ring-red-700 bg-red-50/50 dark:bg-red-900/10',
                  isDragTarget && dropPosition === 'above' && 'border-t-2 border-purple-500',
                  isDragTarget && dropPosition === 'below' && 'border-b-2 border-purple-500',
                )}
              >
                {/* Scene Header */}
                <div className="flex justify-between items-center px-1 pt-0.5">
                  {/* Drag grip */}
                  <GripVertical className="w-3 h-3 shrink-0 text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing mr-0.5" />
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span
                      className={cn(
                        'text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center shrink-0',
                        isActive
                          ? 'bg-purple-600 dark:bg-purple-500 text-white shadow-sm shadow-purple-500/30'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400',
                      )}
                    >
                      {index + 1}
                    </span>
                    <span
                      data-testid="scene-title"
                      className={cn(
                        'text-xs font-bold truncate transition-colors flex-1 min-w-0',
                        isActive
                          ? 'text-purple-700 dark:text-purple-300'
                          : 'text-gray-600 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100',
                      )}
                    >
                      {scene.title}
                    </span>
                  </div>

                  {/* Delete button */}
                  {onDeleteScene && !isConfirmingDelete && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDeleteId(scene.id);
                      }}
                      className="shrink-0 ml-1 p-0.5 rounded opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                      title="Delete slide"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}

                  {/* Confirm delete */}
                  {isConfirmingDelete && (
                    <div className="flex items-center gap-1 ml-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteScene?.(scene.id);
                          setConfirmDeleteId(null);
                        }}
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500 text-white hover:bg-red-600 transition-colors"
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteId(null);
                        }}
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>

                {/* Thumbnail */}
                <div className="relative aspect-video w-full rounded overflow-hidden bg-gray-100 dark:bg-gray-800 ring-1 ring-black/5 dark:ring-white/5">
                  <div className="absolute inset-0 flex items-center justify-center">
                    {isSlide && slideContent ? (
                      <ThumbnailSlide
                        slide={slideContent.canvas}
                        viewportSize={viewportSize}
                        viewportRatio={viewportRatio}
                        size={Math.max(100, sidebarWidth - 28)}
                      />
                    ) : scene.type === 'quiz' ? (
                      /* Quiz: question bar + 2x2 option grid */
                      <div className="w-full h-full bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/20 p-2 flex flex-col">
                        <div className="h-1.5 w-4/5 bg-orange-200/70 dark:bg-orange-700/30 rounded-full mb-1.5" />
                        <div className="flex-1 grid grid-cols-2 gap-1">
                          {[0, 1, 2, 3].map((i) => (
                            <div
                              key={i}
                              className={cn(
                                'rounded flex items-center gap-1 px-1',
                                i === 1
                                  ? 'bg-orange-400/20 dark:bg-orange-500/20 border border-orange-300/50 dark:border-orange-600/30'
                                  : 'bg-white/60 dark:bg-white/5 border border-orange-100/60 dark:border-orange-800/20',
                              )}
                            >
                              <div
                                className={cn(
                                  'w-1.5 h-1.5 rounded-full shrink-0',
                                  i === 1
                                    ? 'bg-orange-400 dark:bg-orange-500'
                                    : 'bg-orange-200 dark:bg-orange-700/50',
                                )}
                              />
                              <div
                                className={cn(
                                  'h-1 rounded-full flex-1',
                                  i === 1
                                    ? 'bg-orange-300/60 dark:bg-orange-600/40'
                                    : 'bg-orange-100/80 dark:bg-orange-800/30',
                                )}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : scene.type === 'interactive' ? (
                      /* [INTERACTIVE DISABLED] Placeholder for disabled interactive scenes */
                      <div className="w-full h-full bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
                        <span className="text-[8px] text-gray-300 dark:text-gray-600">Disabled</span>
                      </div>
                    ) : scene.type === 'pbl' ? (
                      /* PBL: kanban board with 3 columns */
                      <div className="w-full h-full bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/20 p-1.5 flex flex-col">
                        <div className="flex items-center gap-1 mb-1.5">
                          <div className="w-1.5 h-1.5 rounded bg-blue-300 dark:bg-blue-600" />
                          <div className="h-1 w-8 bg-blue-200/60 dark:bg-blue-700/30 rounded-full" />
                        </div>
                        <div className="flex-1 flex gap-1 overflow-hidden">
                          {[0, 1, 2].map((col) => (
                            <div
                              key={col}
                              className="flex-1 bg-white/50 dark:bg-white/5 rounded p-0.5 flex flex-col gap-0.5"
                            >
                              <div
                                className={cn(
                                  'h-0.5 w-3 rounded-full mb-0.5',
                                  col === 0
                                    ? 'bg-blue-300/70'
                                    : col === 1
                                      ? 'bg-amber-300/70'
                                      : 'bg-green-300/70',
                                )}
                              />
                              {Array.from({
                                length: col === 0 ? 3 : col === 1 ? 2 : 1,
                              }).map((_, i) => (
                                <div
                                  key={i}
                                  className="h-2 w-full bg-blue-100/60 dark:bg-blue-800/20 rounded border border-blue-200/30 dark:border-blue-700/20"
                                />
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      /* Fallback */
                      <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-gray-50 dark:bg-gray-800 text-gray-300 dark:text-gray-500">
                        <Icon className="w-4 h-4" />
                        <span className="text-[9px] font-bold uppercase tracking-wider opacity-80">
                          {scene.type}
                        </span>
                      </div>
                    )}

                    {isSlide && (
                      <div
                        className={cn(
                          'absolute inset-0 bg-purple-500/0 transition-colors',
                          isActive
                            ? 'bg-purple-500/0'
                            : 'group-hover:bg-black/5 dark:group-hover:bg-white/5',
                        )}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Insert after this scene */}
              {onAddAISlide && (
                <div className="relative">
                  {insertAfterOrder === scene.order && (
                    <InsertSlidePopover
                      insertAfterOrder={scene.order}
                      onConfirm={async (title, type) => {
                        const result = await onAddAISlide(scene.order, title, type);
                        if (!result.success) throw new Error(result.error);
                      }}
                      onClose={() => setInsertAfterOrder(null)}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setInsertAfterOrder(insertAfterOrder === scene.order ? null : scene.order)
                    }
                    className="w-full flex items-center justify-center gap-1 py-0.5 rounded-md text-[10px] font-semibold text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors opacity-0 hover:opacity-100 focus:opacity-100"
                    title="Add AI slide after this"
                  >
                    <Plus className="w-3 h-3" />
                    <span className="hidden group-hover:inline">Add slide after</span>
                  </button>
                </div>
              )}
              </div>
            );
          })}

          {/* Single placeholder for the next generating page (clickable) */}
          {generatingOutlines.length > 0 &&
            (() => {
              const outline = generatingOutlines[0];
              const isFailed = failedOutlines.some((f) => f.id === outline.id);
              const isRetrying = retryingOutlineId === outline.id;
              const isPaused = generationStatus === 'paused';
              const isActive = currentSceneId === PENDING_SCENE_ID;

              return (
                <div
                  key={`generating-${outline.id}`}
                  onClick={() => {
                    if (isFailed) return;
                    if (onSceneSelect) {
                      onSceneSelect(PENDING_SCENE_ID);
                    } else {
                      setCurrentSceneId(PENDING_SCENE_ID);
                    }
                  }}
                  className={cn(
                    'group relative rounded-lg flex flex-col gap-1 p-1.5 transition-all duration-200',
                    isFailed
                      ? 'opacity-100 cursor-default'
                      : 'cursor-pointer hover:bg-gray-50/80 dark:hover:bg-gray-800/50',
                    !isFailed && !isActive && 'opacity-60',
                    isActive &&
                      !isFailed &&
                      'bg-purple-50 dark:bg-purple-900/20 ring-1 ring-purple-200 dark:ring-purple-700 opacity-100',
                  )}
                >
                  {/* Scene Header */}
                  <div className="flex justify-between items-center px-2 pt-0.5">
                    <div className="flex items-center gap-2 max-w-full">
                      <span
                        className={cn(
                          'text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center shrink-0',
                          isActive && !isFailed
                            ? 'bg-purple-600 dark:bg-purple-500 text-white shadow-sm shadow-purple-500/30'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500',
                        )}
                      >
                        {scenes.length + 1}
                      </span>
                      <span
                        className={cn(
                          'text-xs font-bold truncate transition-colors',
                          isActive && !isFailed
                            ? 'text-purple-700 dark:text-purple-300'
                            : isFailed
                              ? 'text-gray-700 dark:text-gray-200'
                              : 'text-gray-400 dark:text-gray-500',
                        )}
                      >
                        {outline.title}
                      </span>
                    </div>
                  </div>

                  {/* Skeleton Thumbnail */}
                  <div
                    className={cn(
                      'relative aspect-video w-full rounded overflow-hidden ring-1',
                      isFailed
                        ? 'bg-red-50/30 dark:bg-red-950/10 ring-red-100 dark:ring-red-900/20'
                        : 'bg-gray-100 dark:bg-gray-800 ring-black/5 dark:ring-white/5',
                    )}
                  >
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
                      {isFailed ? (
                        <div className="flex items-center gap-1 text-xs font-medium text-red-500/90 dark:text-red-400">
                          {onRetryOutline ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRetryOutline(outline.id);
                              }}
                              disabled={isRetrying}
                              className="p-1 -ml-1 rounded-md hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors active:scale-95 disabled:opacity-50 disabled:active:scale-100"
                              title={t('generation.retryScene')}
                            >
                              <RefreshCw
                                className={cn('w-3.5 h-3.5', isRetrying && 'animate-spin')}
                              />
                            </button>
                          ) : (
                            <AlertCircle className="w-3.5 h-3.5" />
                          )}
                          <span>
                            {isRetrying
                              ? t('generation.retryingScene')
                              : t('stage.generationFailed')}
                          </span>
                        </div>
                      ) : (
                        <>
                          <div
                            className={cn(
                              'h-2 w-3/5 bg-gray-200 dark:bg-gray-700 rounded',
                              !isPaused && 'animate-pulse',
                            )}
                          />
                          <div
                            className={cn(
                              'h-1.5 w-2/5 bg-gray-200 dark:bg-gray-700 rounded',
                              !isPaused && 'animate-pulse',
                            )}
                          />
                          <span className="text-[9px] font-medium text-gray-400 dark:text-gray-500 mt-0.5">
                            {isPaused ? t('stage.paused') : t('stage.generating')}
                          </span>
                        </>
                      )}
                    </div>
                    {!isFailed && !isPaused && (
                      <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/40 dark:via-white/10 to-transparent" />
                    )}
                  </div>
                </div>
              );
            })()}
        </div>

        {/* Spacer to push toggle button area */}
        <div className="mt-auto" />
      </div>
    </div>
  );
}
