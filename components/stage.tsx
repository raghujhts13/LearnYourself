'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useStageStore } from '@/lib/store';
import { PENDING_SCENE_ID } from '@/lib/store/stage';
import { useCanvasStore } from '@/lib/store/canvas';
import { useSettingsStore } from '@/lib/store/settings';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useSceneGenerator } from '@/lib/hooks/use-scene-generator';
import { SceneSidebar } from './stage/scene-sidebar';
import { SpeakerNotesPanel } from './stage/speaker-notes-panel';
import { QASidebar } from './stage/qa-sidebar';
import { ClassNotesPanel } from './stage/class-notes-panel';
import { Header } from './header';
import { CanvasArea } from '@/components/canvas/canvas-area';
import { PlaybackEngine, computePlaybackView } from '@/lib/playback';
import type { EngineMode, Effect } from '@/lib/playback';
import { ActionEngine } from '@/lib/action/engine';
import { createAudioPlayer } from '@/lib/utils/audio-player';
import type { Action, SpeechAction } from '@/lib/types/action';
import { cn } from '@/lib/utils';
import { ProfessorBar } from '@/components/professor-bar';
import { savePlaybackState, loadPlaybackState, clearPlaybackState } from '@/lib/utils/playback-storage';

/**
 * Stage Component
 *
 * The main container for professor session playback.
 * Shows slides, professor speech captions, whiteboard, and playback controls.
 */
export function Stage({
  onRetryOutline,
}: {
  onRetryOutline?: (outlineId: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const { mode, getCurrentScene, scenes, currentSceneId, setCurrentSceneId, generatingOutlines, deleteScene, updateScene } =
    useStageStore();
  const failedOutlines = useStageStore.use.failedOutlines();

  const { generateSingleSlide } = useSceneGenerator();

  const currentScene = getCurrentScene();

  // Layout state from settings store (persisted via localStorage)
  const sidebarCollapsed = useSettingsStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useSettingsStore((s) => s.setSidebarCollapsed);
  const setTTSMuted = useSettingsStore((s) => s.setTTSMuted);
  const setTTSVolume = useSettingsStore((s) => s.setTTSVolume);

  // PlaybackEngine state
  const [engineMode, setEngineMode] = useState<EngineMode>('idle');
  const [playbackCompleted, setPlaybackCompleted] = useState(false);
  const [lectureSpeech, setLectureSpeech] = useState<string | null>(null);

  const [isPresenting, setIsPresenting] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isSlideEditing, setIsSlideEditing] = useState(false);
  const [showSpeakerNotes, setShowSpeakerNotes] = useState(false);
  const [showQASidebar, setShowQASidebar] = useState(false);
  const [showClassNotes, setShowClassNotes] = useState(false);

  // Whiteboard state (from canvas store so AI tools can open it)
  const whiteboardOpen = useCanvasStore.use.whiteboardOpen();
  const setWhiteboardOpen = useCanvasStore.use.setWhiteboardOpen();

  const ttsMuted = useSettingsStore((s) => s.ttsMuted);
  const ttsEnabled = useSettingsStore((s) => s.ttsEnabled);
  const ttsVolume = useSettingsStore((s) => s.ttsVolume);
  const playbackSpeed = useSettingsStore((s) => s.playbackSpeed);

  const engineRef = useRef<PlaybackEngine | null>(null);
  const audioPlayerRef = useRef(createAudioPlayer());
  const presentationIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const autoStartRef = useRef(false);
  const resumedRef = useRef(false);

  // ── Playback persistence: save position periodically and on pause/scene-change ──
  const stage = useStageStore((s) => s.stage);
  const stageId = stage?.id ?? null;

  /** Save current playback snapshot to IndexedDB */
  const persistPlaybackPosition = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || !stageId) return;
    const snapshot = engine.getSnapshot();
    const allScenes = useStageStore.getState().scenes;
    const curSceneId = useStageStore.getState().currentSceneId;
    const sceneIndex = allScenes.findIndex((s) => s.id === curSceneId);
    if (sceneIndex < 0) return;
    savePlaybackState(stageId, {
      sceneIndex,
      actionIndex: snapshot.actionIndex,
      sceneId: curSceneId ?? undefined,
    }).catch(() => {});
  }, [stageId]);

  const resetSceneState = useCallback(() => {
    setPlaybackCompleted(false);
    setLectureSpeech(null);
  }, []);

  const clearPresentationIdleTimer = useCallback(() => {
    if (presentationIdleTimerRef.current) {
      clearTimeout(presentationIdleTimerRef.current);
      presentationIdleTimerRef.current = null;
    }
  }, []);

  const resetPresentationIdleTimer = useCallback(() => {
    setControlsVisible(true);
    clearPresentationIdleTimer();
    if (isPresenting) {
      presentationIdleTimerRef.current = setTimeout(() => {
        setControlsVisible(false);
      }, 3000);
    }
  }, [clearPresentationIdleTimer, isPresenting]);

  const togglePresentation = useCallback(async () => {
    const stageElement = stageRef.current;
    if (!stageElement) return;

    try {
      if (document.fullscreenElement === stageElement) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (navigator as any).keyboard?.unlock?.();
        await document.exitFullscreen();
        return;
      }

      setControlsVisible(true);
      await stageElement.requestFullscreen();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (navigator as any).keyboard?.lock?.(['Escape']).catch(() => {});
      setSidebarCollapsed(true);
    } catch {
      console.warn('[Presentation] Fullscreen request denied — browser policy');
    }
  }, [setSidebarCollapsed]);

  useEffect(() => {
    const onFullscreenChange = () => {
      const active = document.fullscreenElement === stageRef.current;
      setIsPresenting(active);

      if (!active) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (navigator as any).keyboard?.unlock?.();
        setControlsVisible(true);
        clearPresentationIdleTimer();
      }
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, [clearPresentationIdleTimer]);

  useEffect(() => {
    if (!isPresenting) {
      setControlsVisible(true);
      clearPresentationIdleTimer();
      return;
    }

    const handleActivity = () => {
      resetPresentationIdleTimer();
    };

    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('mousedown', handleActivity);
    window.addEventListener('touchstart', handleActivity);
    resetPresentationIdleTimer();

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('mousedown', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      clearPresentationIdleTimer();
    };
  }, [clearPresentationIdleTimer, isPresenting, resetPresentationIdleTimer]);

  // Resume from saved position when stage first loads
  useEffect(() => {
    if (!stageId || resumedRef.current) return;
    resumedRef.current = true;

    loadPlaybackState(stageId).then((snapshot) => {
      if (!snapshot) return;
      const allScenes = useStageStore.getState().scenes;
      if (!allScenes.length) return;

      const targetScene = snapshot.sceneId
        ? allScenes.find((s) => s.id === snapshot.sceneId)
        : allScenes[snapshot.sceneIndex];

      if (targetScene && targetScene.id !== useStageStore.getState().currentSceneId) {
        useStageStore.getState().setCurrentSceneId(targetScene.id);
      }
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageId]);

  // Initialize playback engine when scene changes
  useEffect(() => {
    resetSceneState();

    if (!currentScene || !currentScene.actions || currentScene.actions.length === 0) {
      engineRef.current = null;
      setEngineMode('idle');
      return;
    }

    if (engineRef.current) {
      engineRef.current.stop();
    }

    const actionEngine = new ActionEngine(useStageStore, audioPlayerRef.current);

    const engine = new PlaybackEngine([currentScene], actionEngine, audioPlayerRef.current, {
      onModeChange: (mode) => {
        setEngineMode(mode);
        // Save position when pausing or completing
        if (mode === 'paused' || mode === 'idle') {
          persistPlaybackPosition();
        }
      },
      onSceneChange: (_sceneId) => {},
      onSpeechStart: (text) => {
        setLectureSpeech(text);
      },
      onSpeechEnd: () => {
        // Keep last speech visible until next speech starts
      },
      onEffectFire: (_effect: Effect) => {},
      getPlaybackSpeed: () => useSettingsStore.getState().playbackSpeed || 1,
      onComplete: () => {
        setPlaybackCompleted(true);
        // Save position when scene completes so resume picks up at next scene
        persistPlaybackPosition();

        // Auto-play: advance to next scene after a short pause
        const { autoPlayLecture } = useSettingsStore.getState();
        if (autoPlayLecture) {
          setTimeout(() => {
            const stageState = useStageStore.getState();
            if (!useSettingsStore.getState().autoPlayLecture) return;
            const allScenes = stageState.scenes;
            const curId = stageState.currentSceneId;
            const idx = allScenes.findIndex((s) => s.id === curId);
            if (idx >= 0 && idx < allScenes.length - 1) {
              const currentScene = allScenes[idx];
              // [INTERACTIVE DISABLED] 'interactive' removed from check
              if (
                currentScene.type === 'quiz' ||
                currentScene.type === 'pbl'
              ) {
                return;
              }
              autoStartRef.current = true;
              stageState.setCurrentSceneId(allScenes[idx + 1].id);
            } else if (idx === allScenes.length - 1 && stageState.generatingOutlines.length > 0) {
              const currentScene = allScenes[idx];
              // [INTERACTIVE DISABLED] 'interactive' removed from check
              if (
                currentScene.type === 'quiz' ||
                currentScene.type === 'pbl'
              ) {
                return;
              }
              autoStartRef.current = true;
              stageState.setCurrentSceneId(PENDING_SCENE_ID);
            }
          }, 1500);
        }
      },
    });

    engineRef.current = engine;

    // Interactive scenes (quiz, pbl) still require learner interaction,
    // but we auto-start available narration so learners receive guidance immediately.
    // [INTERACTIVE DISABLED] 'interactive' removed from check
    const isInteractiveScene =
      currentScene.type === 'quiz' ||
      currentScene.type === 'pbl';

    const hasSpeechActions = currentScene.actions.some((a: Action) => a.type === 'speech');
    const shouldAutoNarrateInteractiveScene = isInteractiveScene && hasSpeechActions;

    if ((autoStartRef.current && !isInteractiveScene) || shouldAutoNarrateInteractiveScene) {
      autoStartRef.current = false;
      engine.continuePlayback();
    } else {
      autoStartRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentScene]);

  // Cleanup on unmount
  useEffect(() => {
    const audioPlayer = audioPlayerRef.current;
    return () => {
      if (engineRef.current) {
        engineRef.current.stop();
      }
      audioPlayer.destroy();
      clearPresentationIdleTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync mute state to audioPlayer
  useEffect(() => {
    audioPlayerRef.current.setMuted(ttsMuted);
  }, [ttsMuted]);

  // Sync volume to audioPlayer
  useEffect(() => {
    if (!ttsMuted) {
      audioPlayerRef.current.setVolume(ttsVolume);
    }
  }, [ttsVolume, ttsMuted]);

  // Sync playback speed to audio player
  useEffect(() => {
    audioPlayerRef.current.setPlaybackRate(playbackSpeed);
  }, [playbackSpeed]);

  // First speech text for idle display
  const firstSpeechText = useMemo(
    () => currentScene?.actions?.find((a): a is SpeechAction => a.type === 'speech')?.text ?? null,
    [currentScene],
  );

  // Centralised derived playback view
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

  /**
   * Gated scene switch — always immediate in professor mode (no live sessions to block)
   */
  const gatedSceneSwitch = useCallback(
    (targetSceneId: string): boolean => {
      if (targetSceneId === currentSceneId) return false;
      setCurrentSceneId(targetSceneId);
      return true;
    },
    [currentSceneId, setCurrentSceneId],
  );

  // play/pause toggle
  const handlePlayPause = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;

    const mode = engine.getMode();
    if (mode === 'playing') {
      engine.pause();
    } else if (mode === 'paused') {
      engine.resume();
    } else {
      const wasCompleted = playbackCompleted;
      setPlaybackCompleted(false);
      if (wasCompleted) {
        engine.start();
      } else {
        engine.continuePlayback();
      }
    }
  }, [playbackCompleted]);

  const isPendingScene = currentSceneId === PENDING_SCENE_ID;
  const hasNextPending = generatingOutlines.length > 0;

  const handlePreviousScene = useCallback(() => {
    if (isPendingScene) {
      if (scenes.length > 0) {
        gatedSceneSwitch(scenes[scenes.length - 1].id);
      }
      return;
    }
    const currentIndex = scenes.findIndex((s) => s.id === currentSceneId);
    if (currentIndex > 0) {
      gatedSceneSwitch(scenes[currentIndex - 1].id);
    }
  }, [currentSceneId, gatedSceneSwitch, isPendingScene, scenes]);

  const handleNextScene = useCallback(() => {
    if (isPendingScene) return;
    const currentIndex = scenes.findIndex((s) => s.id === currentSceneId);
    if (currentIndex < scenes.length - 1) {
      gatedSceneSwitch(scenes[currentIndex + 1].id);
    } else if (hasNextPending) {
      setCurrentSceneId(PENDING_SCENE_ID);
    }
  }, [currentSceneId, gatedSceneSwitch, hasNextPending, isPendingScene, scenes, setCurrentSceneId]);

  const currentSceneIndex = isPendingScene
    ? scenes.length
    : scenes.findIndex((s) => s.id === currentSceneId);
  const totalScenesCount = scenes.length + (hasNextPending ? 1 : 0);

  const handleWhiteboardToggle = () => {
    setWhiteboardOpen(!whiteboardOpen);
  };

  const isPresentationShortcutTarget = useCallback((target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable || target.closest('[contenteditable="true"]')) return true;
    return (
      target.closest(
        ['input', 'textarea', 'select', '[role="slider"]', 'input[type="range"]'].join(', '),
      ) !== null
    );
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (
        isPresentationShortcutTarget(event.target) ||
        isPresentationShortcutTarget(document.activeElement)
      ) {
        return;
      }

      switch (event.key) {
        case 'ArrowLeft':
          if (!isPresenting) return;
          event.preventDefault();
          handlePreviousScene();
          resetPresentationIdleTimer();
          break;
        case 'ArrowRight':
          if (!isPresenting) return;
          event.preventDefault();
          handleNextScene();
          resetPresentationIdleTimer();
          break;
        case ' ':
        case 'Spacebar':
          event.preventDefault();
          handlePlayPause();
          break;
        case 'Escape':
          if (isPresenting) {
            event.preventDefault();
            togglePresentation();
          }
          break;
        case 'ArrowUp':
          event.preventDefault();
          setTTSVolume(ttsVolume + 0.1);
          break;
        case 'ArrowDown':
          event.preventDefault();
          setTTSVolume(ttsVolume - 0.1);
          break;
        case 'm':
        case 'M':
          event.preventDefault();
          setTTSMuted(!ttsMuted);
          break;
        case 's':
        case 'S':
          event.preventDefault();
          setSidebarCollapsed(!sidebarCollapsed);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    handleNextScene,
    handlePlayPause,
    handlePreviousScene,
    isPresenting,
    isPresentationShortcutTarget,
    resetPresentationIdleTimer,
    setSidebarCollapsed,
    setTTSMuted,
    setTTSVolume,
    sidebarCollapsed,
    togglePresentation,
    ttsMuted,
    ttsVolume,
  ]);

  useEffect(() => {
    const onF11 = (event: KeyboardEvent) => {
      if (event.key === 'F11') {
        event.preventDefault();
        togglePresentation();
      }
    };
    window.addEventListener('keydown', onF11);
    return () => window.removeEventListener('keydown', onF11);
  }, [togglePresentation]);

  const canvasEngineState = (() => {
    switch (engineMode) {
      case 'playing':
        return 'playing';
      case 'paused':
        return 'paused';
      default:
        return 'idle';
    }
  })();

  // Build actions array for stage API (used by CanvasArea for toolbar)
  const totalActions = currentScene?.actions?.length || 0;

  return (
    <div
      ref={stageRef}
      className={cn(
        'flex-1 flex overflow-hidden bg-gray-50 dark:bg-gray-900',
        isPresenting && !controlsVisible && 'cursor-none',
      )}
    >
      {/* Scene Sidebar */}
      <SceneSidebar
        collapsed={sidebarCollapsed}
        onCollapseChange={setSidebarCollapsed}
        onSceneSelect={gatedSceneSwitch}
        onRetryOutline={onRetryOutline}
        onDeleteScene={deleteScene}
        onAddAISlide={async (insertAfterOrder, title, type) =>
          generateSingleSlide({ insertAfterOrder, title, type })
        }
      />

      {/* Main Content Area + Q&A Sidebar */}
      <div className="flex-1 flex overflow-hidden min-w-0">
        {/* Center column: header + canvas + speaker notes + professor bar */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0 relative">
        {/* Header */}
        {!isPresenting && (
          <Header
            currentSceneTitle={currentScene?.title || ''}
            isSlideEditing={isSlideEditing}
            onToggleSlideEditing={() => setIsSlideEditing((v) => !v)}
            showSpeakerNotes={showSpeakerNotes}
            onToggleSpeakerNotes={() => setShowSpeakerNotes((v) => !v)}
            showQASidebar={showQASidebar}
            onToggleQASidebar={() => setShowQASidebar((v) => !v)}
            showClassNotes={showClassNotes}
            onToggleClassNotes={() => setShowClassNotes((v) => !v)}
          />
        )}

        {/* Canvas Area */}
        <div
          className="overflow-hidden relative flex-1 min-h-0 isolate"
          suppressHydrationWarning
        >
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
            isPendingScene={isPendingScene}
            isGenerationFailed={
              isPendingScene && failedOutlines.some((f) => f.id === generatingOutlines[0]?.id)
            }
            onRetryGeneration={
              onRetryOutline && generatingOutlines[0]
                ? () => onRetryOutline(generatingOutlines[0].id)
                : undefined
            }
            isSlideEditing={isSlideEditing && currentScene?.type === 'slide'}
          />
        </div>

        {/* Speaker Notes Panel */}
        {showSpeakerNotes && !isPresenting && (
          <SpeakerNotesPanel
            scene={currentScene}
            currentSpeech={lectureSpeech}
            onUpdateNotes={(sceneId, notes) => updateScene(sceneId, { speakerNotes: notes })}
          />
        )}

        {/* Professor Bar — playback controls + speech captions */}
        {mode === 'playback' && (
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
        )}
        </div>{/* end center column */}

        {/* Q&A Sidebar */}
        {showQASidebar && !isPresenting && (
          <QASidebar
            scene={currentScene}
            onClose={() => setShowQASidebar(false)}
          />
        )}

        {/* Class Notes Panel */}
        {showClassNotes && !isPresenting && stage?.id && (
          <ClassNotesPanel
            stageId={stage.id}
            classroomId={stage.classroomId ?? ''}
            onClose={() => setShowClassNotes(false)}
          />
        )}
      </div>
    </div>
  );
}
