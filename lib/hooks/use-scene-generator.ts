'use client';

import { useCallback, useRef } from 'react';
import { nanoid } from 'nanoid';
import { useStageStore } from '@/lib/store/stage';
import { getCurrentModelConfig } from '@/lib/utils/model-config';
import { useSettingsStore } from '@/lib/store/settings';
import { db } from '@/lib/utils/database';
import type { SceneOutline, PdfImage, ImageMapping } from '@/lib/types/generation';
import type { Scene, SceneType } from '@/lib/types/stage';
import type { SpeechAction } from '@/lib/types/action';
import { splitLongSpeechActions } from '@/lib/audio/tts-utils';
import { generateMediaForOutlines } from '@/lib/media/media-orchestrator';
import { buildSlideContentFromOutline } from '@/lib/generation/ppt-slide-content-builder';
import { createLogger } from '@/lib/logger';

const log = createLogger('SceneGenerator');

interface SceneContentResult {
  success: boolean;
  content?: unknown;
  effectiveOutline?: SceneOutline;
  error?: string;
}

interface SceneActionsResult {
  success: boolean;
  scene?: Scene;
  previousSpeeches?: string[];
  error?: string;
}

function getApiHeaders(): HeadersInit {
  const config = getCurrentModelConfig();
  const settings = useSettingsStore.getState();
  const imageProviderConfig = settings.imageProvidersConfig?.[settings.imageProviderId];

  return {
    'Content-Type': 'application/json',
    'x-model': config.modelString || '',
    'x-api-key': config.apiKey || '',
    'x-base-url': config.baseUrl || '',
    'x-provider-type': config.providerType || '',
    // Image generation provider
    'x-image-provider': settings.imageProviderId || '',
    'x-image-model': settings.imageModelId || '',
    'x-image-api-key': imageProviderConfig?.apiKey || '',
    'x-image-base-url': imageProviderConfig?.baseUrl || '',
    // Media generation toggles
    'x-image-generation-enabled': String(settings.imageGenerationEnabled ?? false),
    'x-video-generation-enabled': 'false',
  };
}

/** Call POST /api/generate/scene-content (step 1) */
async function fetchSceneContent(
  params: {
    outline: SceneOutline;
    allOutlines: SceneOutline[];
    stageId: string;
    pdfImages?: PdfImage[];
    imageMapping?: ImageMapping;
    stageInfo: {
      name: string;
      description?: string;
      language?: string;
      style?: string;
    };
  },
  signal?: AbortSignal,
): Promise<SceneContentResult> {
  const response = await fetch('/api/generate/scene-content', {
    method: 'POST',
    headers: getApiHeaders(),
    body: JSON.stringify(params),
    signal,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: 'Request failed' }));
    return { success: false, error: data.error || `HTTP ${response.status}` };
  }

  return response.json();
}

/** Call POST /api/generate/scene-actions (step 2) */
async function fetchSceneActions(
  params: {
    outline: SceneOutline;
    allOutlines: SceneOutline[];
    content: unknown;
    stageId: string;
    previousSpeeches?: string[];
    userProfile?: string;
  },
  signal?: AbortSignal,
): Promise<SceneActionsResult> {
  const response = await fetch('/api/generate/scene-actions', {
    method: 'POST',
    headers: getApiHeaders(),
    body: JSON.stringify(params),
    signal,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: 'Request failed' }));
    return { success: false, error: data.error || `HTTP ${response.status}` };
  }

  return response.json();
}

/** Generate TTS for one speech action and store in IndexedDB */
export async function generateAndStoreTTS(
  audioId: string,
  text: string,
  signal?: AbortSignal,
): Promise<void> {
  const settings = useSettingsStore.getState();
  if (settings.ttsProviderId === 'browser-native-tts') return;

  const ttsProviderConfig = settings.ttsProvidersConfig?.[settings.ttsProviderId];

  let blob: Blob;
  let format: string;

  if (settings.ttsProviderId === 'puter-tts') {
    const { generatePuterTTS } = await import('@/lib/audio/puter-audio-adapter');
    const result = await generatePuterTTS(
      text,
      settings.ttsVoice,
      (ttsProviderConfig?.modelId || 'neural') as 'standard' | 'neural' | 'generative'
    );
    format = result.format;
    blob = new Blob([result.audioBuffer], { type: `audio/${format}` });
  } else {
    const response = await fetch('/api/generate/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        audioId,
        ttsProviderId: settings.ttsProviderId,
        ttsModelId: ttsProviderConfig?.modelId,
        ttsVoice: settings.ttsVoice,
        ttsSpeed: settings.ttsSpeed,
        ttsApiKey: ttsProviderConfig?.apiKey || undefined,
        ttsBaseUrl: ttsProviderConfig?.baseUrl || undefined,
      }),
      signal,
    });

    const data = await response
      .json()
      .catch(() => ({ success: false, error: response.statusText || 'Invalid TTS response' }));
    if (!response.ok || !data.success || !data.base64 || !data.format) {
      const err = new Error(
        data.details || data.error || `TTS request failed: HTTP ${response.status}`,
      );
      log.warn('TTS failed for', audioId, ':', err);
      throw err;
    }

    const binary = atob(data.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    format = data.format;
    blob = new Blob([bytes], { type: `audio/${format}` });
  }

  await db.audioFiles.put({
    id: audioId,
    blob,
    format,
    createdAt: Date.now(),
  });
}

/** Generate TTS for all speech actions in a scene.
 * Returns result — failedCount > 0 means some audio is missing and
 * the playback engine will fall back to the reading-timer for those actions.
 * This function NEVER throws; partial failure is tolerated.
 */
async function generateTTSForScene(
  scene: Scene,
  signal?: AbortSignal,
): Promise<{ success: boolean; failedCount: number; error?: string }> {
  const providerId = useSettingsStore.getState().ttsProviderId;
  scene.actions = splitLongSpeechActions(scene.actions || [], providerId);
  const speechActions = scene.actions.filter(
    (a): a is SpeechAction => a.type === 'speech' && !!a.text,
  );
  if (speechActions.length === 0) return { success: true, failedCount: 0 };

  let failedCount = 0;
  let lastError: string | undefined;

  for (const action of speechActions) {
    // Skip if already aborted
    if (signal?.aborted) break;

    const audioId = `tts_${action.id}`;
    action.audioId = audioId;
    try {
      await generateAndStoreTTS(audioId, action.text, signal);
    } catch (error) {
      // TTS failure is non-fatal: the scene is still added and the playback
      // engine will use the reading-timer fallback for the missing audio.
      failedCount++;
      lastError = error instanceof Error ? error.message : `TTS failed for action ${action.id}`;
      log.warn('TTS generation failed (scene will use reading-timer fallback):', {
        providerId,
        actionId: action.id,
        textLength: action.text.length,
        error: lastError,
      });
    }
  }

  // Always report success so the caller adds the scene regardless of TTS outcome.
  // failedCount is purely informational.
  return {
    success: true,
    failedCount,
    error: lastError,
  };
}

export interface UseSceneGeneratorOptions {
  onSceneGenerated?: (scene: Scene, index: number) => void;
  onSceneFailed?: (outline: SceneOutline, error: string) => void;
  onPhaseChange?: (phase: 'content' | 'actions', outline: SceneOutline) => void;
  onComplete?: () => void;
}

export interface GenerationParams {
  pdfImages?: PdfImage[];
  imageMapping?: ImageMapping;
  stageInfo: {
    name: string;
    description?: string;
    language?: string;
    style?: string;
  };
  userProfile?: string;
}

export function useSceneGenerator(options: UseSceneGeneratorOptions = {}) {
  const abortRef = useRef(false);
  const generatingRef = useRef(false);
  const mediaAbortRef = useRef<AbortController | null>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const lastParamsRef = useRef<GenerationParams | null>(null);
  const generateRemainingRef = useRef<((params: GenerationParams) => Promise<void>) | null>(null);

  const store = useStageStore;

  const generateRemaining = useCallback(
    async (params: GenerationParams) => {
      lastParamsRef.current = params;
      if (generatingRef.current) return;
      generatingRef.current = true;
      abortRef.current = false;
      const removeGeneratingOutline = (outlineId: string) => {
        const current = store.getState().generatingOutlines;
        if (!current.some((o) => o.id === outlineId)) return;
        store.getState().setGeneratingOutlines(current.filter((o) => o.id !== outlineId));
      };

      // Create a new AbortController for this generation run
      fetchAbortRef.current = new AbortController();
      const signal = fetchAbortRef.current.signal;

      const state = store.getState();
      const { outlines, scenes, stage } = state;
      const startEpoch = state.generationEpoch;
      if (!stage || outlines.length === 0) {
        generatingRef.current = false;
        return;
      }

      store.getState().setGenerationStatus('generating');

      // Determine pending outlines
      const completedOrders = new Set(scenes.map((s) => s.order));
      const pending = outlines
        .filter((o) => !completedOrders.has(o.order))
        .sort((a, b) => a.order - b.order);

      if (pending.length === 0) {
        store.getState().setGenerationStatus('completed');
        store.getState().setGeneratingOutlines([]);
        options.onComplete?.();
        generatingRef.current = false;
        return;
      }

      store.getState().setGeneratingOutlines(pending);

      // Launch media generation in parallel — does not block content/action generation
      mediaAbortRef.current = new AbortController();
      generateMediaForOutlines(outlines, stage.id, mediaAbortRef.current.signal).catch((err) => {
        log.warn('Media generation error:', err);
      });

      // Get previousSpeeches from last completed scene
      let previousSpeeches: string[] = [];
      const sortedScenes = [...scenes].sort((a, b) => a.order - b.order);
      if (sortedScenes.length > 0) {
        const lastScene = sortedScenes[sortedScenes.length - 1];
        previousSpeeches = (lastScene.actions || [])
          .filter((a): a is SpeechAction => a.type === 'speech')
          .map((a) => a.text);
      }

      // Serial generation loop — two-step per outline
      try {
        let pausedByFailureOrAbort = false;
        for (const outline of pending) {
          if (abortRef.current || store.getState().generationEpoch !== startEpoch) {
            store.getState().setGenerationStatus('paused');
            pausedByFailureOrAbort = true;
            break;
          }

          store.getState().setCurrentGeneratingOrder(outline.order);

          // Step 1: Generate content
          // For from-slides mode: build slide scenes from text without AI.
          // Quizzes (and AI mode) always go through the API.
          options.onPhaseChange?.('content', outline);
          let contentResult: SceneContentResult;
          if (stage.generationMode === 'from-slides' && outline.type === 'slide') {
            contentResult = {
              success: true,
              content: buildSlideContentFromOutline(outline),
              effectiveOutline: outline,
            };
          } else {
            contentResult = await fetchSceneContent(
              {
                outline,
                allOutlines: outlines,
                stageId: stage.id,
                pdfImages: params.pdfImages,
                imageMapping: params.imageMapping,
                stageInfo: params.stageInfo,
              },
              signal,
            );
          }

          if (!contentResult.success || !contentResult.content) {
            if (abortRef.current || store.getState().generationEpoch !== startEpoch) {
              pausedByFailureOrAbort = true;
              break;
            }
            store.getState().addFailedOutline(outline);
            options.onSceneFailed?.(outline, contentResult.error || 'Content generation failed');
            store.getState().setGenerationStatus('paused');
            pausedByFailureOrAbort = true;
            break;
          }

          if (abortRef.current || store.getState().generationEpoch !== startEpoch) {
            store.getState().setGenerationStatus('paused');
            pausedByFailureOrAbort = true;
            break;
          }

          // Step 2: Generate actions + assemble scene
          options.onPhaseChange?.('actions', outline);
          const actionsResult = await fetchSceneActions(
            {
              outline: contentResult.effectiveOutline || outline,
              allOutlines: outlines,
              content: contentResult.content,
              stageId: stage.id,
              previousSpeeches,
              userProfile: params.userProfile,
            },
            signal,
          );

          if (actionsResult.success && actionsResult.scene) {
            const scene = actionsResult.scene;
            const settings = useSettingsStore.getState();

            // TTS generation — partial failure is tolerated; scene is still added.
            // The playback engine will use the reading-timer fallback for any
            // speech actions whose audio files are missing.
            if (settings.ttsEnabled && settings.ttsProviderId !== 'browser-native-tts') {
              const ttsResult = await generateTTSForScene(scene, signal);
              if (abortRef.current || store.getState().generationEpoch !== startEpoch) {
                pausedByFailureOrAbort = true;
                break;
              }
              if (ttsResult.failedCount > 0) {
                log.warn(`TTS partially failed for scene "${scene.title}": ${ttsResult.failedCount} action(s) will use reading-timer fallback. Error: ${ttsResult.error}`);
              }
            }

            // Epoch changed — stage switched, discard this scene
            if (store.getState().generationEpoch !== startEpoch) {
              pausedByFailureOrAbort = true;
              break;
            }

            removeGeneratingOutline(outline.id);
            store.getState().addScene(scene);
            options.onSceneGenerated?.(scene, outline.order);
            previousSpeeches = actionsResult.previousSpeeches || [];
          } else {
            if (abortRef.current || store.getState().generationEpoch !== startEpoch) {
              pausedByFailureOrAbort = true;
              break;
            }
            store.getState().addFailedOutline(outline);
            options.onSceneFailed?.(outline, actionsResult.error || 'Actions generation failed');
            store.getState().setGenerationStatus('paused');
            pausedByFailureOrAbort = true;
            break;
          }
        }

        if (!abortRef.current && !pausedByFailureOrAbort) {
          store.getState().setGenerationStatus('completed');
          store.getState().setGeneratingOutlines([]);
          options.onComplete?.();
        }
      } catch (err: unknown) {
        // AbortError is expected when stop() is called — don't treat as failure
        if (err instanceof DOMException && err.name === 'AbortError') {
          log.info('Generation aborted');
          store.getState().setGenerationStatus('paused');
        } else {
          throw err;
        }
      } finally {
        generatingRef.current = false;
        fetchAbortRef.current = null;
      }
    },
    [options, store],
  );

  // Keep ref in sync so retrySingleOutline can call it
  generateRemainingRef.current = generateRemaining;

  const stop = useCallback(() => {
    abortRef.current = true;
    store.getState().bumpGenerationEpoch();
    fetchAbortRef.current?.abort();
    mediaAbortRef.current?.abort();
  }, [store]);

  const isGenerating = useCallback(() => generatingRef.current, []);

  /** Retry a single failed outline from scratch (content → actions → TTS). */
  const retrySingleOutline = useCallback(
    async (outlineId: string) => {
      const state = store.getState();
      const outline = state.failedOutlines.find((o) => o.id === outlineId);
      const params = lastParamsRef.current;
      if (!outline || !state.stage || !params) return;

      const removeGeneratingOutline = () => {
        const current = store.getState().generatingOutlines;
        if (!current.some((o) => o.id === outlineId)) return;
        store.getState().setGeneratingOutlines(current.filter((o) => o.id !== outlineId));
      };

      // Remove from failed list and mark as generating
      store.getState().retryFailedOutline(outlineId);
      store.getState().setGenerationStatus('generating');
      const currentGenerating = store.getState().generatingOutlines;
      if (!currentGenerating.some((o) => o.id === outline.id)) {
        store.getState().setGeneratingOutlines([...currentGenerating, outline]);
      }

      const abortController = new AbortController();
      const signal = abortController.signal;

      try {
        // Step 1: Content
        let contentResult: SceneContentResult;
        if (state.stage?.generationMode === 'from-slides' && outline.type === 'slide') {
          contentResult = {
            success: true,
            content: buildSlideContentFromOutline(outline),
            effectiveOutline: outline,
          };
        } else {
          contentResult = await fetchSceneContent(
            {
              outline,
              allOutlines: state.outlines,
              stageId: state.stage.id,
              pdfImages: params.pdfImages,
              imageMapping: params.imageMapping,
              stageInfo: params.stageInfo,
            },
            signal,
          );
        }

        if (!contentResult.success || !contentResult.content) {
          store.getState().addFailedOutline(outline);
          return;
        }

        // Step 2: Actions
        const sortedScenes = [...store.getState().scenes].sort((a, b) => a.order - b.order);
        const lastScene = sortedScenes[sortedScenes.length - 1];
        const previousSpeeches = lastScene
          ? (lastScene.actions || [])
              .filter((a): a is SpeechAction => a.type === 'speech')
              .map((a) => a.text)
          : [];

        const actionsResult = await fetchSceneActions(
          {
            outline: contentResult.effectiveOutline || outline,
            allOutlines: state.outlines,
            content: contentResult.content,
            stageId: state.stage.id,
            previousSpeeches,
            userProfile: params.userProfile,
          },
          signal,
        );

        if (!actionsResult.success || !actionsResult.scene) {
          store.getState().addFailedOutline(outline);
          return;
        }

        // Step 3: TTS — partial failure is tolerated (reading-timer fallback)
        const settings = useSettingsStore.getState();
        if (settings.ttsEnabled && settings.ttsProviderId !== 'browser-native-tts') {
          const ttsResult = await generateTTSForScene(actionsResult.scene, signal);
          if (ttsResult.failedCount > 0) {
            log.warn(`TTS partially failed during retry of "${outline.title}": ${ttsResult.failedCount} action(s) will use reading-timer fallback.`);
          }
        }

        removeGeneratingOutline();
        store.getState().addScene(actionsResult.scene);

        // Resume remaining generation if there are pending outlines
        if (store.getState().generatingOutlines.length > 0 && lastParamsRef.current) {
          generateRemainingRef.current?.(lastParamsRef.current);
        }
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          store.getState().addFailedOutline(outline);
        }
      }
    },
    [store],
  );

  /**
   * Generate a single AI slide and insert it at a specific position.
   * `insertAfterOrder` is the `order` of the slide after which to insert.
   * Use -1 to insert at the very beginning.
   */
  const generateSingleSlide = useCallback(
    async ({
      title,
      type = 'slide',
      insertAfterOrder,
    }: {
      title: string;
      type?: SceneType;
      insertAfterOrder: number;
    }) => {
      const state = store.getState();
      if (!state.stage) return { success: false, error: 'No stage loaded' };

      const stageInfo = {
        name: state.stage.name,
        description: state.stage.description,
        language: (state.stage as unknown as { language?: string }).language || 'en-US',
      };

      // Build a minimal outline for the single slide
      const outline: SceneOutline = {
        id: nanoid(),
        type,
        title,
        description: title,
        keyPoints: [],
        order: insertAfterOrder + 0.5,
        language: (stageInfo.language as 'en-US' | 'zh-CN') || 'en-US',
      };

      const allOutlines: SceneOutline[] = [
        ...state.scenes.map((s) => ({
          id: s.id,
          type: s.type,
          title: s.title,
          description: s.title,
          keyPoints: [],
          order: s.order,
        })),
        outline,
      ];

      const abortController = new AbortController();
      const signal = abortController.signal;

      try {
        const contentResult = await fetchSceneContent(
          { outline, allOutlines, stageId: state.stage.id, stageInfo },
          signal,
        );
        if (!contentResult.success || !contentResult.content) {
          return { success: false, error: contentResult.error || 'Content generation failed' };
        }

        const actionsResult = await fetchSceneActions(
          {
            outline: contentResult.effectiveOutline || outline,
            allOutlines,
            content: contentResult.content,
            stageId: state.stage.id,
          },
          signal,
        );
        if (!actionsResult.success || !actionsResult.scene) {
          return { success: false, error: actionsResult.error || 'Actions generation failed' };
        }

        const scene = actionsResult.scene;

        // TTS
        const settings = useSettingsStore.getState();
        if (settings.ttsEnabled && settings.ttsProviderId !== 'browser-native-tts') {
          await generateTTSForScene(scene, signal);
        }

        // Assign order between the two adjacent scenes
        scene.order = insertAfterOrder + 0.5;

        // Add scene; store sorts by order so it lands in the right position
        store.getState().addScene(scene);

        // Re-normalize scene orders to tidy integers
        const updatedScenes = [...store.getState().scenes]
          .sort((a, b) => a.order - b.order)
          .map((s, i) => ({ ...s, order: i }));
        store.getState().setScenes(updatedScenes);

        return { success: true };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
    [store],
  );

  return { generateRemaining, retrySingleOutline, stop, isGenerating, generateSingleSlide };
}
