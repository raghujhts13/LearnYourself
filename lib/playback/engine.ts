/**
 * Playback Engine - State machine for professor lecture playback
 *
 * Consumes Scene.actions[] directly via ActionEngine.
 * No intermediate compile step — actions are executed as-is.
 *
 * State machine:
 *
 *               start()                  pause()
 *  idle ────────────────→ playing ──────────────→ paused
 *    ▲                                               │
 *    │                         resume()             │
 *    │                      ←─────────────────────── │
 *    │ onComplete()
 *    └──────────────────────────────────────────────
 */

import type { Scene } from '@/lib/types/stage';
import type { Action, SpeechAction } from '@/lib/types/action';
import type {
  EngineMode,
  PlaybackEngineCallbacks,
  PlaybackSnapshot,
  Effect,
} from './types';
import type { AudioPlayer } from '@/lib/utils/audio-player';
import { ActionEngine } from '@/lib/action/engine';
import { useSettingsStore } from '@/lib/store/settings';
import { createLogger } from '@/lib/logger';

const log = createLogger('PlaybackEngine');

/**
 * If more than 30% of characters are CJK, treat the text as Chinese.
 */
const CJK_LANG_THRESHOLD = 0.3;

export class PlaybackEngine {
  private scenes: Scene[] = [];
  private sceneIndex: number = 0;
  private actionIndex: number = 0;
  private mode: EngineMode = 'idle';

  // Dependencies
  private audioPlayer: AudioPlayer;
  private actionEngine: ActionEngine;
  private callbacks: PlaybackEngineCallbacks;

  // Scene identity (for snapshot validation)
  private sceneId: string | undefined;

  // Internal state
  // Reading-time timer for speech actions without pre-generated audio (TTS disabled)
  private speechTimer: ReturnType<typeof setTimeout> | null = null;
  private speechTimerStart: number = 0; // Date.now() when timer was scheduled
  // Browser-native TTS state (Web Speech API)
  private browserTTSActive: boolean = false;
  private browserTTSChunks: string[] = []; // sentence-level chunks for sequential playback
  private browserTTSChunkIndex: number = 0; // current chunk being spoken
  private browserTTSPausedChunks: string[] = []; // remaining chunks saved on pause
  private speechTimerRemaining: number = 0; // remaining ms (set on pause)

  constructor(
    scenes: Scene[],
    actionEngine: ActionEngine,
    audioPlayer: AudioPlayer,
    callbacks: PlaybackEngineCallbacks = {},
  ) {
    this.scenes = scenes;
    this.sceneId = scenes[0]?.id;
    this.actionEngine = actionEngine;
    this.audioPlayer = audioPlayer;
    this.callbacks = callbacks;
  }

  // ==================== Public API ====================

  /** Get the current engine mode */
  getMode(): EngineMode {
    return this.mode;
  }

  /** Export a serializable playback snapshot */
  getSnapshot(): PlaybackSnapshot {
    return {
      sceneIndex: this.sceneIndex,
      actionIndex: this.actionIndex,
      sceneId: this.sceneId,
    };
  }

  /** Restore playback position from a snapshot */
  restoreFromSnapshot(snapshot: PlaybackSnapshot): void {
    this.sceneIndex = snapshot.sceneIndex;
    this.actionIndex = snapshot.actionIndex;
  }

  /** idle → playing (from beginning) */
  start(): void {
    if (this.mode !== 'idle') {
      log.warn('Cannot start: not idle, current mode:', this.mode);
      return;
    }

    this.sceneIndex = 0;
    this.actionIndex = 0;
    this.setMode('playing');
    this.processNext();
  }

  /** idle → playing (continue from current position) */
  continuePlayback(): void {
    if (this.mode !== 'idle') {
      log.warn('Cannot continue: not idle, current mode:', this.mode);
      return;
    }
    this.setMode('playing');
    this.processNext();
  }

  /** playing → paused */
  pause(): void {
    if (this.mode === 'playing') {
      if (this.speechTimer) {
        this.speechTimerRemaining = Math.max(
          0,
          this.speechTimerRemaining - (Date.now() - this.speechTimerStart),
        );
        clearTimeout(this.speechTimer);
        this.speechTimer = null;
      }
      this.setMode('paused');
      if (this.browserTTSActive) {
        this.browserTTSPausedChunks = this.browserTTSChunks.slice(this.browserTTSChunkIndex);
        window.speechSynthesis?.cancel();
      } else if (this.audioPlayer.isPlaying()) {
        this.audioPlayer.pause();
      }
    } else {
      log.warn('Cannot pause: mode is', this.mode);
    }
  }

  /** paused → playing (TTS resume) */
  resume(): void {
    if (this.mode !== 'paused') {
      log.warn('Cannot resume: not paused, mode is', this.mode);
      return;
    }

    this.setMode('playing');
    if (this.browserTTSPausedChunks.length > 0) {
      this.browserTTSActive = true;
      this.browserTTSChunks = this.browserTTSPausedChunks;
      this.browserTTSChunkIndex = 0;
      this.browserTTSPausedChunks = [];
      this.playBrowserTTSChunk();
    } else if (this.audioPlayer.hasActiveAudio()) {
      this.audioPlayer.resume();
    } else if (this.speechTimerRemaining > 0) {
      this.speechTimerStart = Date.now();
      this.speechTimer = setTimeout(() => {
        this.speechTimer = null;
        this.speechTimerRemaining = 0;
        this.callbacks.onSpeechEnd?.();
        if (this.mode === 'playing') this.processNext();
      }, this.speechTimerRemaining);
    } else {
      this.processNext();
    }
  }

  /** → idle */
  stop(): void {
    this.setMode('idle');
    this.audioPlayer.stop();
    this.cancelBrowserTTS();
    this.actionEngine.clearEffects();
    if (this.speechTimer) {
      clearTimeout(this.speechTimer);
      this.speechTimer = null;
    }
    this.speechTimerRemaining = 0;
    this.sceneIndex = 0;
    this.actionIndex = 0;
  }

  /** Whether all remaining actions have been consumed */
  isExhausted(): boolean {
    let si = this.sceneIndex;
    let ai = this.actionIndex;
    while (si < this.scenes.length) {
      const actions = this.scenes[si].actions || [];
      if (ai < actions.length) return false;
      si++;
      ai = 0;
    }
    return true;
  }

  // ==================== Private ====================

  private setMode(mode: EngineMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.callbacks.onModeChange?.(mode);
  }

  /**
   * Get the current action, or null if playback is complete.
   * Advances sceneIndex automatically when a scene's actions are exhausted.
   */
  private getCurrentAction(): { action: Action; sceneId: string } | null {
    while (this.sceneIndex < this.scenes.length) {
      const scene = this.scenes[this.sceneIndex];
      const actions = scene.actions || [];

      if (this.actionIndex < actions.length) {
        return { action: actions[this.actionIndex], sceneId: scene.id };
      }

      this.sceneIndex++;
      this.actionIndex = 0;
    }
    return null;
  }

  /**
   * Core processing loop: consume the next action.
   */
  private async processNext(): Promise<void> {
    if (this.mode !== 'playing') return;

    if (this.actionIndex === 0 && this.sceneIndex < this.scenes.length) {
      const scene = this.scenes[this.sceneIndex];
      this.actionEngine.clearEffects();
      this.callbacks.onSceneChange?.(scene.id);
      this.callbacks.onSpeakerChange?.('teacher');
    }

    const current = this.getCurrentAction();
    if (!current) {
      this.actionEngine.clearEffects();
      this.setMode('idle');
      this.callbacks.onComplete?.();
      return;
    }

    const { action } = current;

    this.callbacks.onProgress?.(this.getSnapshot());

    this.actionIndex++;

    switch (action.type) {
      case 'speech': {
        const speechAction = action as SpeechAction;
        this.callbacks.onSpeechStart?.(speechAction.text);

        this.audioPlayer.onEnded(() => {
          this.callbacks.onSpeechEnd?.();
          if (this.mode === 'playing') {
            this.processNext();
          }
        });

        const scheduleReadingTimer = () => {
          const text = speechAction.text;
          const cjkCount = (
            text.match(/[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g) || []
          ).length;
          const isCJK = cjkCount > text.length * 0.3;
          const speed = this.callbacks.getPlaybackSpeed?.() ?? 1;
          const rawMs = isCJK
            ? Math.max(2000, text.length * 150)
            : Math.max(2000, text.split(/\s+/).filter(Boolean).length * 240);
          const readingMs = rawMs / speed;
          this.speechTimerStart = Date.now();
          this.speechTimerRemaining = readingMs;
          this.speechTimer = setTimeout(() => {
            this.speechTimer = null;
            this.speechTimerRemaining = 0;
            this.callbacks.onSpeechEnd?.();
            if (this.mode === 'playing') this.processNext();
          }, readingMs);
        };

        this.audioPlayer
          .play(speechAction.audioId || '', speechAction.audioUrl)
          .then((audioStarted) => {
            if (!audioStarted) {
              const settings = useSettingsStore.getState();
              const hasBrowserTTS =
                typeof window !== 'undefined' && !!window.speechSynthesis;
              if (
                settings.ttsEnabled &&
                hasBrowserTTS
              ) {
                // Use browser-native TTS as live fallback for any provider
                // (covers both browser-native-tts selection and missing puter-tts/server audio)
                this.playBrowserTTS(speechAction);
              } else {
                scheduleReadingTimer();
              }
            }
          })
          .catch((err) => {
            log.error('TTS error:', err);
            scheduleReadingTimer();
          });
        break;
      }

      case 'spotlight':
      case 'laser': {
        this.actionEngine.execute(action);
        this.callbacks.onEffectFire?.({
          kind: action.type,
          targetId: action.elementId,
          ...(action.type === 'spotlight'
            ? { dimOpacity: action.dimOpacity }
            : { color: action.color }),
        } as Effect);
        queueMicrotask(() => this.processNext());
        break;
      }

      case 'play_video':
      case 'wb_open':
      case 'wb_draw_text':
      case 'wb_draw_shape':
      case 'wb_draw_chart':
      case 'wb_draw_latex':
      case 'wb_draw_table':
      case 'wb_draw_line':
      case 'wb_clear':
      case 'wb_delete':
      case 'wb_close': {
        await this.actionEngine.execute(action);
        if (this.mode === 'playing') {
          this.processNext();
        }
        break;
      }

      default:
        this.processNext();
        break;
    }
  }

  // ==================== Browser Native TTS ====================

  private splitIntoChunks(text: string): string[] {
    const chunks = text
      .split(/(?<=[.!?。！？\n])\s*/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return chunks.length > 0 ? chunks : [text];
  }

  private playBrowserTTS(speechAction: SpeechAction): void {
    this.browserTTSChunks = this.splitIntoChunks(speechAction.text);
    this.browserTTSChunkIndex = 0;
    this.browserTTSPausedChunks = [];
    this.browserTTSActive = true;
    this.playBrowserTTSChunk();
  }

  private async playBrowserTTSChunk(): Promise<void> {
    if (this.browserTTSChunkIndex >= this.browserTTSChunks.length) {
      this.browserTTSActive = false;
      this.browserTTSChunks = [];
      this.callbacks.onSpeechEnd?.();
      if (this.mode === 'playing') this.processNext();
      return;
    }

    const settings = useSettingsStore.getState();
    const chunkText = this.browserTTSChunks[this.browserTTSChunkIndex];
    const utterance = new SpeechSynthesisUtterance(chunkText);

    const speed = this.callbacks.getPlaybackSpeed?.() ?? 1;
    utterance.rate = (settings.ttsSpeed ?? 1) * speed;
    utterance.volume = settings.ttsMuted ? 0 : (settings.ttsVolume ?? 1);

    const voices = await this.ensureVoicesLoaded();

    let voiceFound = false;
    if (settings.ttsVoice && settings.ttsVoice !== 'default') {
      const voice = voices.find((v) => v.voiceURI === settings.ttsVoice);
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
        voiceFound = true;
      }
    }
    if (!voiceFound) {
      const cjkRatio =
        chunkText.length > 0
          ? (chunkText.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length / chunkText.length
          : 0;
      utterance.lang = cjkRatio > CJK_LANG_THRESHOLD ? 'zh-CN' : 'en-US';
    }

    utterance.onend = () => {
      this.browserTTSChunkIndex++;
      if (this.mode === 'playing') {
        this.playBrowserTTSChunk();
      }
    };

    utterance.onerror = (event) => {
      if (event.error !== 'canceled') {
        log.warn('Browser TTS chunk error:', event.error);
        this.browserTTSChunkIndex++;
        if (this.mode === 'playing') {
          this.playBrowserTTSChunk();
        }
      }
    };

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  private cachedVoices: SpeechSynthesisVoice[] | null = null;
  private async ensureVoicesLoaded(): Promise<SpeechSynthesisVoice[]> {
    if (this.cachedVoices && this.cachedVoices.length > 0) {
      return this.cachedVoices;
    }

    let voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      this.cachedVoices = voices;
      return voices;
    }

    await new Promise<void>((resolve) => {
      const onVoicesChanged = () => {
        window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
        resolve();
      };
      window.speechSynthesis.addEventListener('voiceschanged', onVoicesChanged);
      setTimeout(() => {
        window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
        resolve();
      }, 2000);
    });

    voices = window.speechSynthesis.getVoices();
    this.cachedVoices = voices;
    return voices;
  }

  private cancelBrowserTTS(): void {
    if (this.browserTTSActive) {
      this.browserTTSActive = false;
      this.browserTTSChunks = [];
      this.browserTTSChunkIndex = 0;
      this.browserTTSPausedChunks = [];
      window.speechSynthesis?.cancel();
    }
  }
}
