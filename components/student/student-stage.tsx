'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useStageStore } from '@/lib/store';
import { useCanvasStore } from '@/lib/store/canvas';
import { useSettingsStore } from '@/lib/store/settings';
import { SceneSidebar } from '@/components/stage/scene-sidebar';
import { QASidebar } from '@/components/stage/qa-sidebar';
import { StudentHeader } from './student-header';
import { CanvasArea } from '@/components/canvas/canvas-area';
import { PlaybackEngine, computePlaybackView } from '@/lib/playback';
import type { EngineMode, Effect } from '@/lib/playback';
import { ActionEngine } from '@/lib/action/engine';
import { createAudioPlayer } from '@/lib/utils/audio-player';
import type { SpeechAction } from '@/lib/types/action';
import { cn } from '@/lib/utils';
import { ProfessorBar } from '@/components/professor-bar';

/**
 * StudentStage
 *
 * Read-only playback view for learners.
 * No editing, speaker notes, or export capabilities.
 * Students can navigate slides, play the lecture, and use the Q&A assistant.
 */
export function StudentStage() {
  const { mode, getCurrentScene, scenes, currentSceneId, setCurrentSceneId } = useStageStore();

  const currentScene = getCurrentScene();

  const sidebarCollapsed = useSettingsStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useSettingsStore((s) => s.setSidebarCollapsed);
  const ttsMuted = useSettingsStore((s) => s.ttsMuted);
  const ttsEnabled = useSettingsStore((s) => s.ttsEnabled);
  const ttsVolume = useSettingsStore((s) => s.ttsVolume);
  const playbackSpeed = useSettingsStore((s) => s.playbackSpeed);
  const setTTSMuted = useSettingsStore((s) => s.setTTSMuted);
  const setTTSVolume = useSettingsStore((s) => s.setTTSVolume);

  const [engineMode, setEngineMode] = useState<EngineMode>('idle');
  const [playbackCompleted, setPlaybackCompleted] = useState(false);
  const [lectureSpeech, setLectureSpeech] = useState<string | null>(null);
  const [isPresenting, setIsPresenting] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [showQASidebar, setShowQASidebar] = useState(false);

  const whiteboardOpen = useCanvasStore.use.whiteboardOpen();
  const setWhiteboardOpen = useCanvasStore.use.setWhiteboardOpen();

  const engineRef = useRef<PlaybackEngine | null>(null);
  const audioPlayerRef = useRef(createAudioPlayer());
  const stageRef = useRef<HTMLDivElement>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoStartRef = useRef(false);

  const stage = useStageStore((s) => s.stage);

  // ── Presentation / fullscreen ─────────────────────────────────────────────

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const resetIdleTimer = useCallback(() => {
    setControlsVisible(true);
    clearIdleTimer();
    if (isPresenting) {
      idleTimerRef.current = setTimeout(() => setControlsVisible(false), 3000);
    }
  }, [clearIdleTimer, isPresenting]);

  const togglePresentation = useCallback(async () => {
    const el = stageRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement === el) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (navigator as any).keyboard?.unlock?.();
        await document.exitFullscreen();
      } else {
        setControlsVisible(true);
        await el.requestFullscreen();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (navigator as any).keyboard?.lock?.(['Escape']).catch(() => {});
        setSidebarCollapsed(true);
      }
    } catch {
      console.warn('[Student] Fullscreen request denied');
    }
  }, [setSidebarCollapsed]);

  useEffect(() => {
    const onChange = () => {
      const active = document.fullscreenElement === stageRef.current;
      setIsPresenting(active);
      if (!active) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (navigator as any).keyboard?.unlock?.();
        setControlsVisible(true);
        clearIdleTimer();
      }
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [clearIdleTimer]);

  useEffect(() => {
    if (!isPresenting) {
      setControlsVisible(true);
      clearIdleTimer();
      return;
    }
    const onActivity = () => resetIdleTimer();
    window.addEventListener('mousemove', onActivity);
    window.addEventListener('mousedown', onActivity);
    window.addEventListener('touchstart', onActivity);
    resetIdleTimer();
    return () => {
      window.removeEventListener('mousemove', onActivity);
      window.removeEventListener('mousedown', onActivity);
      window.removeEventListener('touchstart', onActivity);
      clearIdleTimer();
    };
  }, [isPresenting, resetIdleTimer, clearIdleTimer]);

  // ── PlaybackEngine ────────────────────────────────────────────────────────

  const resetSceneState = useCallback(() => {
    setPlaybackCompleted(false);
    setLectureSpeech(null);
  }, []);

  useEffect(() => {
    resetSceneState();

    if (!currentScene?.actions?.length) {
      engineRef.current = null;
      setEngineMode('idle');
      return;
    }

    engineRef.current?.stop();

    const actionEngine = new ActionEngine(useStageStore, audioPlayerRef.current);
    const engine = new PlaybackEngine([currentScene], actionEngine, audioPlayerRef.current, {
      onModeChange: (m) => setEngineMode(m),
      onSceneChange: () => {},
      onSpeechStart: (text) => setLectureSpeech(text),
      onSpeechEnd: () => {},
      onEffectFire: (_effect: Effect) => {},
      getPlaybackSpeed: () => useSettingsStore.getState().playbackSpeed || 1,
      onComplete: () => {
        setPlaybackCompleted(true);
        // Auto-advance for non-interactive scenes
        const { autoPlayLecture } = useSettingsStore.getState();
        if (autoPlayLecture) {
          setTimeout(() => {
            const stageState = useStageStore.getState();
            if (!useSettingsStore.getState().autoPlayLecture) return;
            const allScenes = stageState.scenes;
            const curId = stageState.currentSceneId;
            const idx = allScenes.findIndex((s) => s.id === curId);
            const cur = allScenes[idx];
            // [INTERACTIVE DISABLED] 'interactive' removed from check
            if (cur?.type === 'quiz' || cur?.type === 'pbl') return;
            if (idx >= 0 && idx < allScenes.length - 1) {
              autoStartRef.current = true;
              stageState.setCurrentSceneId(allScenes[idx + 1].id);
            }
          }, 1500);
        }
      },
    });

    engineRef.current = engine;

    // [INTERACTIVE DISABLED] 'interactive' removed from check
    const isInteractive =
      currentScene.type === 'quiz' ||
      currentScene.type === 'pbl';

    if (autoStartRef.current && !isInteractive) {
      autoStartRef.current = false;
      engine.start();
    } else {
      autoStartRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentScene]);

  // Cleanup
  useEffect(() => {
    const player = audioPlayerRef.current;
    return () => {
      engineRef.current?.stop();
      player.destroy();
      clearIdleTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Audio sync
  useEffect(() => { audioPlayerRef.current.setMuted(ttsMuted); }, [ttsMuted]);
  useEffect(() => { if (!ttsMuted) audioPlayerRef.current.setVolume(ttsVolume); }, [ttsVolume, ttsMuted]);
  useEffect(() => { audioPlayerRef.current.setPlaybackRate(playbackSpeed); }, [playbackSpeed]);

  // ── Scene navigation ──────────────────────────────────────────────────────

  const gatedSceneSwitch = useCallback(
    (targetSceneId: string) => {
      if (targetSceneId === currentSceneId) return false;
      setCurrentSceneId(targetSceneId);
      return true;
    },
    [currentSceneId, setCurrentSceneId],
  );

  const currentSceneIndex = scenes.findIndex((s) => s.id === currentSceneId);
  const totalScenesCount = scenes.length;

  const handlePreviousScene = useCallback(() => {
    const idx = scenes.findIndex((s) => s.id === currentSceneId);
    if (idx > 0) gatedSceneSwitch(scenes[idx - 1].id);
  }, [currentSceneId, gatedSceneSwitch, scenes]);

  const handleNextScene = useCallback(() => {
    const idx = scenes.findIndex((s) => s.id === currentSceneId);
    if (idx >= 0 && idx < scenes.length - 1) gatedSceneSwitch(scenes[idx + 1].id);
  }, [currentSceneId, gatedSceneSwitch, scenes]);

  const handlePlayPause = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;
    const m = engine.getMode();
    if (m === 'playing') {
      engine.pause();
    } else if (m === 'paused') {
      engine.resume();
    } else {
      const wasCompleted = playbackCompleted;
      setPlaybackCompleted(false);
      if (wasCompleted) engine.start();
      else engine.continuePlayback();
    }
  }, [playbackCompleted]);

  const handleWhiteboardToggle = () => setWhiteboardOpen(!whiteboardOpen);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  const isInputTarget = useCallback((target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable || target.closest('[contenteditable="true"]')) return true;
    return target.closest('input, textarea, select, [role="slider"], input[type="range"]') !== null;
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isInputTarget(e.target) || isInputTarget(document.activeElement)) return;
      switch (e.key) {
        case 'ArrowLeft':
          if (!isPresenting) return;
          e.preventDefault();
          handlePreviousScene();
          resetIdleTimer();
          break;
        case 'ArrowRight':
          if (!isPresenting) return;
          e.preventDefault();
          handleNextScene();
          resetIdleTimer();
          break;
        case ' ':
        case 'Spacebar':
          e.preventDefault();
          handlePlayPause();
          break;
        case 'Escape':
          if (isPresenting) { e.preventDefault(); togglePresentation(); }
          break;
        case 'ArrowUp':
          e.preventDefault();
          setTTSVolume(ttsVolume + 0.1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          setTTSVolume(ttsVolume - 0.1);
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          setTTSMuted(!ttsMuted);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleNextScene, handlePlayPause, handlePreviousScene, isInputTarget, isPresenting, resetIdleTimer, setTTSMuted, setTTSVolume, togglePresentation, ttsMuted, ttsVolume]);

  // ── Derived state ─────────────────────────────────────────────────────────

  const firstSpeechText = useMemo(
    () => currentScene?.actions?.find((a): a is SpeechAction => a.type === 'speech')?.text ?? null,
    [currentScene],
  );

  const playbackView = useMemo(
    () =>
      computePlaybackView({
        engineMode,
        lectureSpeech,
        playbackCompleted,
        idleText: firstSpeechText,
      }),
    [engineMode, lectureSpeech, playbackCompleted, firstSpeechText],
  );

  const canvasEngineState = engineMode === 'playing' ? 'playing' : engineMode === 'paused' ? 'paused' : 'idle';
  const totalActions = currentScene?.actions?.length || 0;

  return (
    <div
      ref={stageRef}
      className={cn(
        'flex-1 flex overflow-hidden bg-gray-50 dark:bg-gray-900',
        isPresenting && !controlsVisible && 'cursor-none',
      )}
    >
      {/* Scene Sidebar — read-only (no add/delete props) */}
      <SceneSidebar
        collapsed={sidebarCollapsed}
        onCollapseChange={setSidebarCollapsed}
        onSceneSelect={gatedSceneSwitch}
      />

      {/* Main area + Q&A sidebar */}
      <div className="flex-1 flex overflow-hidden min-w-0">
        {/* Center column */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0 relative">
          {/* Student Header */}
          {!isPresenting && (
            <StudentHeader
              classroomName={stage?.name ?? 'Classroom'}
              currentSceneTitle={currentScene?.title ?? ''}
              ttsMuted={ttsMuted}
              ttsVolume={ttsVolume}
              ttsEnabled={ttsEnabled}
              isPresenting={isPresenting}
              showQASidebar={showQASidebar}
              onTTSMuteToggle={() => setTTSMuted(!ttsMuted)}
              onVolumeChange={setTTSVolume}
              onToggleQASidebar={() => setShowQASidebar((v) => !v)}
              onTogglePresentation={togglePresentation}
            />
          )}

          {/* Canvas */}
          <div className="overflow-hidden relative flex-1 min-h-0 isolate" suppressHydrationWarning>
            <CanvasArea
              currentScene={currentScene}
              currentSceneIndex={currentSceneIndex}
              scenesCount={totalScenesCount}
              mode={mode}
              engineState={canvasEngineState}
              isLiveSession={false}
              whiteboardOpen={whiteboardOpen}
              sidebarCollapsed={sidebarCollapsed}
              chatCollapsed={true}
              onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
              onToggleChat={() => {}}
              onPrevSlide={handlePreviousScene}
              onNextSlide={handleNextScene}
              onPlayPause={handlePlayPause}
              onWhiteboardClose={handleWhiteboardToggle}
              isPresenting={isPresenting}
              onTogglePresentation={togglePresentation}
              showStopDiscussion={false}
              onStopDiscussion={() => {}}
              hideToolbar={mode === 'playback' || (isPresenting && !controlsVisible)}
              isPendingScene={false}
              isGenerationFailed={false}
              isSlideEditing={false}
            />
          </div>

          {/* Playback controls bar */}
          <div
            className={cn(
              'shrink-0 transition-opacity duration-300',
              isPresenting && 'absolute inset-x-0 bottom-0 z-20',
            )}
          >
            <ProfessorBar
              playbackView={playbackView}
              ttsEnabled={ttsEnabled}
              ttsMuted={ttsMuted}
              ttsVolume={ttsVolume}
              playbackSpeed={playbackSpeed}
              currentSceneIndex={currentSceneIndex}
              scenesCount={totalScenesCount}
              totalActions={totalActions}
              whiteboardOpen={whiteboardOpen}
              sidebarCollapsed={sidebarCollapsed}
              isPresenting={isPresenting}
              controlsVisible={controlsVisible}
              onPlayPause={handlePlayPause}
              onPrevSlide={handlePreviousScene}
              onNextSlide={handleNextScene}
              onWhiteboardToggle={handleWhiteboardToggle}
              onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
              onTogglePresentation={togglePresentation}
              onTTSMuteToggle={() => setTTSMuted(!ttsMuted)}
              onVolumeChange={setTTSVolume}
            />
          </div>
        </div>

        {/* Q&A Sidebar */}
        {showQASidebar && !isPresenting && (
          <QASidebar scene={currentScene} onClose={() => setShowQASidebar(false)} />
        )}
      </div>
    </div>
  );
}
