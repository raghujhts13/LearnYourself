'use client';

import Canvas from './Canvas';
import type { StageMode } from '@/lib/types/stage';
import { ScreenCanvas } from './ScreenCanvas';

/**
 * Slide Editor - wraps Canvas with SceneProvider
 * isEditing: when true, show the full editable Canvas even in playback mode
 */
export function SlideEditor({
  mode,
  isEditing,
}: {
  readonly mode: StageMode;
  readonly isEditing?: boolean;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-hidden">
        {mode === 'autonomous' || isEditing ? <Canvas /> : <ScreenCanvas />}
      </div>
    </div>
  );
}
