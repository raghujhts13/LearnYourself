/**
 * Puter.js Audio Adapter
 *
 * Provides FREE, unlimited Text-to-Speech (TTS) and Automatic Speech
 * Recognition (ASR) via the Puter.js SDK (https://js.puter.com/v2/).
 *
 * TTS:  puter.ai.txt2speech(text, { voice, engine, language })
 *       - Returns an HTMLAudioElement that can be played directly
 *       - Engine: 'standard' | 'neural' | 'generative'
 *       - Voices: Amazon Polly-style (Joanna, Matthew, ...)
 *
 * ASR:  puter.ai.speech2txt(file, { model })
 *       - Accepts File, Blob, data URL, or remote URL
 *       - Models: 'gpt-4o-mini-transcribe' | 'gpt-4o-transcribe' | 'whisper-1'
 *       - Returns { text: string }
 *
 * Both run ENTIRELY IN THE BROWSER — no server call, no API key needed.
 * Users cover their own usage via their free Puter.com account.
 *
 * Docs:
 *   - TTS: https://developer.puter.com/tutorials/free-unlimited-text-to-speech-api/
 *   - ASR: https://developer.puter.com/tutorials/free-unlimited-speech-to-text-api/
 */

// ─── Puter.js minimal typings ──────────────────────────────────────────────

interface PuterTxt2SpeechOptions {
  voice?: string;
  engine?: 'standard' | 'neural' | 'generative';
  language?: string;
}

interface PuterSpeech2TxtOptions {
  model?: string;
  language?: string;
}

interface PuterAI {
  txt2img?: (prompt: string, options?: Record<string, unknown>) => Promise<HTMLImageElement>;
  txt2speech(text: string, options?: PuterTxt2SpeechOptions | string): Promise<HTMLAudioElement>;
  speech2txt(
    file: File | Blob | string,
    options?: PuterSpeech2TxtOptions,
  ): Promise<{ text: string } | string>;
}

interface PuterSDK {
  ai: PuterAI;
}

// Removed global window declaration to avoid conflict with puter-seedream-adapter.ts

const PUTER_SCRIPT_URL = 'https://js.puter.com/v2/';
let _puterLoadPromise: Promise<void> | null = null;

/**
 * Ensures the Puter.js SDK is loaded in the browser.
 * Safe to call multiple times — only injects the script once.
 */
export async function ensurePuterLoaded(): Promise<void> {
  if (typeof window === 'undefined') {
    throw new Error('Puter.js requires a browser environment');
  }
  if (window.puter) return;
  if (_puterLoadPromise) return _puterLoadPromise;

  _puterLoadPromise = new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[src="${PUTER_SCRIPT_URL}"]`)) {
      const poll = setInterval(() => {
        if ((window as any).puter) { clearInterval(poll); resolve(); }
      }, 100);
      setTimeout(() => { clearInterval(poll); reject(new Error('Puter.js timed out')); }, 15_000);
      return;
    }

    const script = document.createElement('script');
    script.src = PUTER_SCRIPT_URL;
    script.async = true;
    script.onerror = () => reject(new Error('Failed to load Puter.js SDK'));
    document.head.appendChild(script);

    const poll = setInterval(() => {
      if ((window as any).puter) { clearInterval(poll); resolve(); }
    }, 100);
    setTimeout(() => {
      clearInterval(poll);
      if (!(window as any).puter) reject(new Error('Puter.js SDK failed to initialize'));
    }, 15_000);
  });

  return _puterLoadPromise;
}

// ─── TTS ───────────────────────────────────────────────────────────────────

export interface PuterTTSResult {
  /** ArrayBuffer of MP3 audio data for storage (e.g. into IndexedDB) */
  audioBuffer: ArrayBuffer;
  format: 'mp3';
}

/**
 * Convert text to speech using Puter.js (client-side, free, no API key).
 *
 * The audio is returned as an ArrayBuffer so it can be stored in IndexedDB
 * and played back via the existing TTS playback engine.
 */
export async function generatePuterTTS(
  text: string,
  voice: string = 'Joanna',
  engine: 'standard' | 'neural' | 'generative' = 'neural',
  language?: string,
): Promise<PuterTTSResult> {
  await ensurePuterLoaded();

  const puterSDK = (window as any).puter as PuterSDK;
  if (!puterSDK?.ai?.txt2speech) {
    throw new Error('Puter.js AI txt2speech is not available');
  }

  const options: PuterTxt2SpeechOptions = { voice, engine };
  if (language && language !== 'default') options.language = language;

  const audioElement = await puterSDK.ai.txt2speech(text, options);

  // Extract audio data from the HTMLAudioElement's src.
  // Puter may return a blob: URL, data: URL, or a cross-origin URL.
  // We try multiple strategies to obtain the raw ArrayBuffer.
  const src = audioElement.src;
  if (!src) throw new Error('Puter TTS returned an audio element with no src');

  const audioBuffer = await fetchAudioBuffer(src);
  return { audioBuffer, format: 'mp3' };
}

/**
 * Fetch audio data as an ArrayBuffer from a URL.
 * Tries fetch() first; falls back to XHR when fetch fails (e.g. CORS restrictions
 * on some Puter CDN endpoints that don't set Access-Control-Allow-Origin).
 */
async function fetchAudioBuffer(src: string): Promise<ArrayBuffer> {
  // Strategy 1: standard fetch (works for blob:, data:, and CORS-enabled URLs)
  try {
    const response = await fetch(src, { mode: 'cors' });
    if (response.ok) {
      return await response.arrayBuffer();
    }
    // non-OK status — fall through to XHR
  } catch {
    // Network error or CORS rejection — fall through to XHR
  }

  // Strategy 2: no-cors fetch (creates an opaque response; only useful to check
  // reachability — we cannot read the body from opaque responses)
  // Strategy 3: XHR with responseType 'arraybuffer' — bypasses some CORS issues
  // when the browser permits the resource (same-origin, blob:, data:)
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', src, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = () => {
      if (xhr.status === 0 || (xhr.status >= 200 && xhr.status < 300)) {
        // status 0 is normal for blob: and data: URLs
        resolve(xhr.response as ArrayBuffer);
      } else {
        reject(new Error(`Failed to fetch Puter TTS audio via XHR: HTTP ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error('Failed to fetch Puter TTS audio: network error'));
    xhr.send();
  });
}

// ─── ASR ───────────────────────────────────────────────────────────────────

export interface PuterASRResult {
  text: string;
}

/**
 * Transcribe audio using Puter.js (client-side, free, no API key).
 *
 * Accepts a Blob (e.g. from MediaRecorder) or a File.
 * Internally uses OpenAI's Whisper / GPT-4o transcription models via Puter.
 */
export async function transcribeWithPuterASR(
  audio: Blob | File,
  model: string = 'gpt-4o-mini-transcribe',
  language?: string,
): Promise<PuterASRResult> {
  await ensurePuterLoaded();

  const puterSDK = (window as any).puter as PuterSDK;
  if (!puterSDK?.ai?.speech2txt) {
    throw new Error('Puter.js AI speech2txt is not available');
  }

  const options: PuterSpeech2TxtOptions = { model };
  if (language && language !== 'auto') options.language = language;

  const result = await puterSDK.ai.speech2txt(audio, options);

  // puter.ai.speech2txt can return { text } object or raw string
  const text = typeof result === 'string' ? result : (result?.text ?? '');
  return { text };
}
