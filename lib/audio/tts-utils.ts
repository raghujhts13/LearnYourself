/**
 * Shared TTS utilities used by both client-side and server-side generation.
 */

import type { TTSProviderId } from './types';
import type { Action, SpeechAction } from '@/lib/types/action';
import type { Scene } from '@/lib/types/stage';
import { createLogger } from '@/lib/logger';

const log = createLogger('TTS');

/** Provider-specific max text length limits. */
export const TTS_MAX_TEXT_LENGTH: Partial<Record<TTSProviderId, number>> = {
  'glm-tts': 1024,
};

/**
 * Resolve the scene-level speakable script.
 * Priority:
 * 1) Trimmed non-empty scene.speakerNotes
 * 2) Concatenated speech action text (legacy fallback)
 */
export function getSceneSpeakableScript(scene: Scene | null): string {
  if (!scene) return '';

  const notes = scene.speakerNotes?.trim();
  if (notes) return notes;

  const speechText = (scene.actions || [])
    .filter((a): a is SpeechAction => a.type === 'speech')
    .map((a) => a.text.trim())
    .filter(Boolean)
    .join('\n\n');

  return speechText;
}

/**
 * Build effective actions for speaking a scene.
 * - When trimmed speakerNotes exists: replace all speech actions with one speech action
 *   carrying the notes script (non-speech actions are preserved in order).
 * - When notes are empty/whitespace: keep original actions unchanged.
 */
export function getSceneSpeakableActions(scene: Scene | null): Action[] {
  if (!scene) return [];

  const actions = scene.actions || [];
  const script = scene.speakerNotes?.trim();
  if (!script) return actions;

  const firstSpeech = actions.find((a): a is SpeechAction => a.type === 'speech');
  const { audioId: _audioId, audioUrl: _audioUrl, ...baseSpeech } = firstSpeech || {
    id: `${scene.id}_speaker_notes`,
    type: 'speech' as const,
    text: '',
  };

  const notesSpeechAction: SpeechAction = {
    ...baseSpeech,
    type: 'speech',
    text: script,
  };

  let inserted = false;
  const nextActions: Action[] = [];

  for (const action of actions) {
    if (action.type === 'speech') {
      if (!inserted) {
        nextActions.push(notesSpeechAction);
        inserted = true;
      }
      continue;
    }
    nextActions.push(action);
  }

  if (!inserted) {
    nextActions.unshift(notesSpeechAction);
  }

  return nextActions;
}

/**
 * Build speakable actions and apply provider-aware speech chunking.
 */
export function getSceneSpeakableActionsForTTS(scene: Scene, providerId: TTSProviderId): Action[] {
  const effectiveActions = getSceneSpeakableActions(scene);
  return splitLongSpeechActions(effectiveActions, providerId);
}

/**
 * Split long text into chunks that respect sentence boundaries.
 * Tries splitting at sentence-ending punctuation first, then clause-level
 * punctuation, and finally hard-splits at maxLength as a last resort.
 */
export function splitLongSpeechText(text: string, maxLength: number): string[] {
  const normalized = text.trim();
  if (!normalized || normalized.length <= maxLength) return [normalized];

  const units = normalized
    .split(/(?<=[。！？!?；;：:\n])/u)
    .map((part) => part.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';

  const pushChunk = (value: string) => {
    const trimmed = value.trim();
    if (trimmed) chunks.push(trimmed);
  };

  const appendUnit = (unit: string) => {
    if (!current) {
      current = unit;
      return;
    }
    if ((current + unit).length <= maxLength) {
      current += unit;
      return;
    }
    pushChunk(current);
    current = unit;
  };

  const hardSplitUnit = (unit: string) => {
    const parts = unit.split(/(?<=[，,、])/u).filter(Boolean);
    if (parts.length > 1) {
      for (const part of parts) {
        if (part.length <= maxLength) appendUnit(part);
        else hardSplitUnit(part);
      }
      return;
    }

    let start = 0;
    while (start < unit.length) {
      appendUnit(unit.slice(start, start + maxLength));
      start += maxLength;
    }
  };

  for (const unit of units.length > 0 ? units : [normalized]) {
    if (unit.length <= maxLength) appendUnit(unit);
    else hardSplitUnit(unit);
  }

  pushChunk(current);
  return chunks;
}

/**
 * Split long speech actions into multiple shorter actions so each stays
 * within the TTS provider's text length limit. Each sub-action gets its
 * own independent audio file — no byte concatenation needed.
 */
export function splitLongSpeechActions(actions: Action[], providerId: TTSProviderId): Action[] {
  const maxLength = TTS_MAX_TEXT_LENGTH[providerId];
  if (!maxLength) return actions;

  let didSplit = false;
  const nextActions: Action[] = actions.flatMap((action) => {
    if (action.type !== 'speech' || !action.text || action.text.length <= maxLength)
      return [action];

    const chunks = splitLongSpeechText(action.text, maxLength);
    if (chunks.length <= 1) return [action];
    didSplit = true;
    const { audioId: _audioId, ...baseAction } = action as SpeechAction;

    log.info(
      `Split speech for ${providerId}: action=${action.id}, len=${action.text.length}, chunks=${chunks.length}`,
    );
    return chunks.map((chunk, i) => ({
      ...baseAction,
      id: `${action.id}_tts_${i + 1}`,
      text: chunk,
    }));
  });
  return didSplit ? nextActions : actions;
}
