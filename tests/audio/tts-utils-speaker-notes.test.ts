import { describe, expect, it } from 'vitest';

import {
  getSceneSpeakableActions,
  getSceneSpeakableActionsForTTS,
  getSceneSpeakableScript,
} from '@/lib/audio/tts-utils';
import type { Scene } from '@/lib/types/stage';

function createScene(overrides: Partial<Scene> = {}): Scene {
  return {
    id: 'scene-1',
    stageId: 'stage-1',
    type: 'slide',
    title: 'Test Scene',
    order: 0,
    content: { type: 'slide', html: '' },
    actions: [
      { id: 'speech-1', type: 'speech', text: 'Generated part one.', audioId: 'audio-1' },
      { id: 'speech-2', type: 'speech', text: 'Generated part two.', audioId: 'audio-2' },
    ],
    ...overrides,
  } as Scene;
}

describe('speakerNotes speakable script integration', () => {
  it('uses trimmed non-empty speakerNotes as speakable script', () => {
    const scene = createScene({ speakerNotes: '  Custom speaker notes script.  ' });

    expect(getSceneSpeakableScript(scene)).toBe('Custom speaker notes script.');
  });

  it('falls back to speech actions when speakerNotes is empty or whitespace', () => {
    const withWhitespace = createScene({ speakerNotes: '   \n\t  ' });
    const cleared = createScene({ speakerNotes: '' });

    expect(getSceneSpeakableScript(withWhitespace)).toBe(
      'Generated part one.\n\nGenerated part two.',
    );
    expect(getSceneSpeakableScript(cleared)).toBe('Generated part one.\n\nGenerated part two.');
  });

  it('replaces speech actions with a single speakerNotes action and strips stale audio links', () => {
    const scene = createScene({
      speakerNotes: 'Override narration text.',
      actions: [
        { id: 'spot-1', type: 'spotlight', elementId: 'title' },
        { id: 'speech-1', type: 'speech', text: 'Generated part one.', audioId: 'audio-1' },
        { id: 'speech-2', type: 'speech', text: 'Generated part two.', audioId: 'audio-2' },
      ],
    });

    const speakable = getSceneSpeakableActions(scene);
    const speechActions = speakable.filter((a) => a.type === 'speech');

    expect(speechActions).toHaveLength(1);
    expect((speechActions[0] as { text: string }).text).toBe('Override narration text.');
    expect((speechActions[0] as { audioId?: string }).audioId).toBeUndefined();
  });

  it('reverts to generated speech actions after user clears notes', () => {
    const scene = createScene({ speakerNotes: '' });

    const speakable = getSceneSpeakableActions(scene);
    const speechTexts = speakable
      .filter((a) => a.type === 'speech')
      .map((a) => (a as { text: string }).text);

    expect(speechTexts).toEqual(['Generated part one.', 'Generated part two.']);
  });

  it('keeps speakerNotes override on the existing TTS chunking path', () => {
    const longSentence = 'This sentence is intentionally long to trigger GLM chunking. '.repeat(50);
    const scene = createScene({
      speakerNotes: longSentence,
      actions: [{ id: 'speech-1', type: 'speech', text: 'Generated part one.' }],
    });

    const chunked = getSceneSpeakableActionsForTTS(scene, 'glm-tts');
    const speechActions = chunked.filter((a) => a.type === 'speech');

    expect(speechActions.length).toBeGreaterThan(1);
  });
});
