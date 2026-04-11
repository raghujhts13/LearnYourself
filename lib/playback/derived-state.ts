/**
 * Derived Playback State - Pure function that computes a high-level PlaybackView
 * from the raw playback state in the professor-only session player.
 */

import type { EngineMode } from './types';

// ---------------------------------------------------------------------------
// Input: raw state collected from Stage's useState variables
// ---------------------------------------------------------------------------

export interface PlaybackRawState {
  engineMode: EngineMode;
  lectureSpeech: string | null;
  playbackCompleted: boolean;
  idleText: string | null;
}

// ---------------------------------------------------------------------------
// Output: a single derived view consumed by the professor playback UI
// ---------------------------------------------------------------------------

export type PlaybackPhase =
  | 'idle'
  | 'lecturePlaying'
  | 'lecturePaused'
  | 'completed';

export type BubbleButtonState = 'bars' | 'play' | 'restart' | 'none';

export interface PlaybackView {
  /** High-level phase — "what is happening right now?" */
  phase: PlaybackPhase;

  /** Text to display in the speech caption */
  sourceText: string;

  /** Bubble button state */
  buttonState: BubbleButtonState;

  /** Whether the professor is actively speaking */
  isProfessorSpeaking: boolean;

  /** Never true in professor-only mode */
  isTopicActive: false;
}

// ---------------------------------------------------------------------------
// Pure computation
// ---------------------------------------------------------------------------

export function computePlaybackView(raw: PlaybackRawState): PlaybackView {
  const { engineMode, lectureSpeech, playbackCompleted, idleText } = raw;

  // ---- phase ----
  let phase: PlaybackPhase;
  if (playbackCompleted) {
    phase = 'completed';
  } else if (engineMode === 'playing') {
    phase = 'lecturePlaying';
  } else if (engineMode === 'paused') {
    phase = 'lecturePaused';
  } else {
    phase = 'idle';
  }

  // ---- sourceText ----
  let sourceText: string;
  if (lectureSpeech) {
    sourceText = lectureSpeech;
  } else if (phase === 'completed') {
    sourceText = '';
  } else {
    sourceText = idleText || '';
  }

  // ---- buttonState ----
  let buttonState: BubbleButtonState;
  if (phase === 'lecturePlaying') {
    buttonState = 'bars';
  } else if (phase === 'completed') {
    buttonState = 'restart';
  } else {
    buttonState = 'play';
  }

  return {
    phase,
    sourceText,
    buttonState,
    isProfessorSpeaking: engineMode === 'playing' && !!lectureSpeech,
    isTopicActive: false,
  };
}
