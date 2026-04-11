'use client';

import { useI18n } from '@/lib/hooks/use-i18n';
import type { PlaybackView } from '@/lib/playback/derived-state';
import type { PlaybackSpeed } from '@/lib/store/settings';
import { PLAYBACK_SPEEDS } from '@/lib/store/settings';
import {
  Play,
  Pause,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  PanelLeft,
  PenLine,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useSettingsStore } from '@/lib/store/settings';

interface ProfessorBarProps {
  playbackView: PlaybackView;
  ttsEnabled: boolean;
  ttsMuted: boolean;
  ttsVolume: number;
  playbackSpeed: PlaybackSpeed;
  currentSceneIndex: number;
  scenesCount: number;
  totalActions: number;
  whiteboardOpen: boolean;
  sidebarCollapsed: boolean;
  isPresenting: boolean;
  controlsVisible: boolean;
  onPlayPause: () => void;
  onPrevSlide: () => void;
  onNextSlide: () => void;
  onWhiteboardToggle: () => void;
  onToggleSidebar: () => void;
  onTogglePresentation: () => void;
  onTTSMuteToggle: () => void;
  onVolumeChange: (volume: number) => void;
}

export function ProfessorBar({
  playbackView,
  ttsEnabled,
  ttsMuted,
  ttsVolume,
  playbackSpeed,
  currentSceneIndex,
  scenesCount,
  whiteboardOpen,
  sidebarCollapsed,
  isPresenting,
  controlsVisible,
  onPlayPause,
  onPrevSlide,
  onNextSlide,
  onWhiteboardToggle,
  onToggleSidebar,
  onTogglePresentation,
  onTTSMuteToggle,
  onVolumeChange,
}: ProfessorBarProps) {
  const { t } = useI18n();
  const setPlaybackSpeed = useSettingsStore((s) => s.setPlaybackSpeed);

  const { phase, buttonState } = playbackView;

  const isPlaying = phase === 'lecturePlaying';
  const isCompleted = phase === 'completed';

  const progressPercent =
    scenesCount > 0
      ? Math.max(0, Math.min(100, ((currentSceneIndex + 1) / scenesCount) * 100))
      : 0;

  const nextSpeedIndex = PLAYBACK_SPEEDS.indexOf(playbackSpeed);
  const cycleSpeed = () => {
    const nextIdx = (nextSpeedIndex + 1) % PLAYBACK_SPEEDS.length;
    setPlaybackSpeed(PLAYBACK_SPEEDS[nextIdx]);
  };

  return (
    <div
      className={cn(
        'w-full bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm',
        'border-t border-gray-200/60 dark:border-gray-700/60',
        'transition-opacity duration-300',
        isPresenting && !controlsVisible && 'opacity-0 pointer-events-none',
      )}
    >
      {/* Progress bar — top of bar */}
      {scenesCount > 0 && (
        <div className="h-0.5 bg-gray-100 dark:bg-gray-800">
          <div
            className="h-full bg-violet-500 transition-all duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}

      {/* Speech captions removed — use the Speaker Notes panel for live highlighting */}

      {/* Controls Row */}
      <div className="px-3 py-1.5 flex items-center gap-1">
        {/* Left: Sidebar toggle */}
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'h-8 w-8 p-0 transition-colors',
            sidebarCollapsed
              ? 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              : 'text-violet-500 hover:text-violet-600',
          )}
          onClick={onToggleSidebar}
          title={sidebarCollapsed ? t('toolbar.openSidebar') : t('toolbar.closeSidebar')}
        >
          <PanelLeft className="h-4 w-4" />
        </Button>

        {/* Center: Playback controls */}
        <div className="flex-1 flex items-center justify-center gap-1">
          {/* Previous slide */}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 disabled:opacity-30"
            onClick={onPrevSlide}
            disabled={currentSceneIndex <= 0}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          {/* Play/Pause/Restart */}
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'h-9 w-9 p-0 rounded-full transition-all duration-150',
              isPlaying
                ? 'text-violet-600 hover:text-violet-700 bg-violet-50 dark:bg-violet-900/20 hover:bg-violet-100 dark:hover:bg-violet-900/30'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800',
            )}
            onClick={onPlayPause}
          >
            {isCompleted || buttonState === 'restart' ? (
              <RotateCcw className="h-4 w-4" />
            ) : isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>

          {/* Next slide */}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 disabled:opacity-30"
            onClick={onNextSlide}
            disabled={currentSceneIndex >= scenesCount - 1}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>

          {/* Scene counter */}
          <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums min-w-[3.5rem] text-center select-none">
            {scenesCount > 0 ? `${currentSceneIndex + 1} / ${scenesCount}` : '--'}
          </span>

          {/* Speed button */}
          <button
            onClick={cycleSpeed}
            className="text-xs font-medium tabular-nums text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 select-none"
            title={t('toolbar.playbackSpeed')}
          >
            {playbackSpeed}×
          </button>
        </div>

        {/* Right: Audio + Whiteboard + Presentation */}
        <div className="flex items-center gap-0.5">
          {/* Mute/Unmute */}
          {ttsEnabled && (
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-8 w-8 p-0 transition-colors',
                ttsMuted
                  ? 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100',
              )}
              onClick={onTTSMuteToggle}
              title={ttsMuted ? t('toolbar.unmute') : t('toolbar.mute')}
            >
              {ttsMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </Button>
          )}

          {/* Volume slider (visible when TTS enabled and not muted) */}
          {ttsEnabled && !ttsMuted && (
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={ttsVolume}
              onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
              className="w-16 h-1 accent-violet-500 cursor-pointer"
              title={`Volume: ${Math.round(ttsVolume * 100)}%`}
            />
          )}

          {/* Whiteboard toggle */}
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'h-8 w-8 p-0 transition-colors',
              whiteboardOpen
                ? 'text-violet-500 hover:text-violet-600 bg-violet-50 dark:bg-violet-900/20'
                : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-100',
            )}
            onClick={onWhiteboardToggle}
            title={t('toolbar.whiteboard')}
          >
            <PenLine className="h-4 w-4" />
          </Button>

          {/* Presentation mode toggle */}
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'h-8 w-8 p-0 transition-colors',
              isPresenting
                ? 'text-violet-500 hover:text-violet-600'
                : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-100',
            )}
            onClick={onTogglePresentation}
            title={isPresenting ? t('toolbar.exitPresentation') : t('toolbar.present')}
          >
            {isPresenting ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
