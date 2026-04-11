/**
 * Playback Types - Types for professor lecture playback
 */

import type { PlaybackSnapshot } from '@/lib/utils/playback-storage';

export type { PlaybackSnapshot };

/** Visual effects (for onEffectFire callback) */
export type Effect =
  | { kind: 'spotlight'; targetId: string; dimOpacity?: number }
  | { kind: 'laser'; targetId: string; color?: string };

/** Engine mode state machine */
export type EngineMode = 'idle' | 'playing' | 'paused';

/** Playback engine callbacks */
export interface PlaybackEngineCallbacks {
  onModeChange?: (mode: EngineMode) => void;
  onSceneChange?: (sceneId: string) => void;
  onSpeechStart?: (text: string) => void;
  onSpeechEnd?: () => void;
  onSpeakerChange?: (role: string) => void;
  onEffectFire?: (effect: Effect) => void;

  // Progress tracking (for persistence)
  onProgress?: (snapshot: PlaybackSnapshot) => void;

  /** Get current playback speed multiplier (e.g. 1, 1.5, 2) */
  getPlaybackSpeed?: () => number;

  onComplete?: () => void;
}
