'use client';

import { MessageCircleQuestion, Volume2, VolumeX, Maximize, Minimize } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StudentHeaderProps {
  readonly classroomName: string;
  readonly currentSceneTitle: string;
  readonly ttsMuted: boolean;
  readonly ttsVolume: number;
  readonly ttsEnabled: boolean;
  readonly isPresenting: boolean;
  readonly showQASidebar: boolean;
  readonly onTTSMuteToggle: () => void;
  readonly onVolumeChange: (v: number) => void;
  readonly onToggleQASidebar: () => void;
  readonly onTogglePresentation: () => void;
}

export function StudentHeader({
  classroomName,
  currentSceneTitle,
  ttsMuted,
  ttsVolume,
  ttsEnabled,
  isPresenting,
  showQASidebar,
  onTTSMuteToggle,
  onVolumeChange,
  onToggleQASidebar,
  onTogglePresentation,
}: StudentHeaderProps) {
  return (
    <header className="h-14 px-4 flex items-center justify-between z-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-100/60 dark:border-gray-800/60 shrink-0 gap-3">
      {/* Left: Logo + titles */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <img src="/lys-logo.png" alt="LYS" className="h-8 w-auto shrink-0" />
        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 shrink-0" />
        <div className="flex flex-col min-w-0">
          <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium truncate leading-none mb-0.5">
            {classroomName}
          </span>
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate leading-tight">
            {currentSceneTitle}
          </span>
        </div>
      </div>

      {/* Right: controls */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Q&A Toggle */}
        <button
          onClick={onToggleQASidebar}
          title={showQASidebar ? 'Close Q&A assistant' : 'Ask about this slide'}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all',
            showQASidebar
              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700',
          )}
        >
          <MessageCircleQuestion className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Ask AI</span>
        </button>

        <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />

        {/* Mute/Unmute */}
        {ttsEnabled && (
          <button
            onClick={onTTSMuteToggle}
            title={ttsMuted ? 'Unmute narration' : 'Mute narration'}
            className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            {ttsMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        )}

        {/* Volume slider */}
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

        {/* Fullscreen */}
        <button
          onClick={onTogglePresentation}
          title={isPresenting ? 'Exit fullscreen' : 'Enter fullscreen'}
          className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          {isPresenting ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
        </button>
      </div>
    </header>
  );
}
