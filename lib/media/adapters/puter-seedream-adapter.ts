/**
 * Puter.js Seedream Image Generation Adapter
 *
 * Uses the Puter.js SDK (https://js.puter.com/v2/) to generate images with
 * ByteDance Seedream models for FREE — no API key required.
 *
 * The Puter "User-Pays" model lets users generate images using their own
 * free Puter.com account quota. On first use, Puter.js may prompt the user
 * to log in to puter.com.
 *
 * This adapter runs entirely on the CLIENT side — it must NOT be imported
 * in server-side code (Next.js API routes / server components).
 *
 * Supported models:
 * - ByteDance-Seed/Seedream-4.0  (via together-ai provider)
 * - ByteDance-Seed/Seedream-3.0  (via together-ai provider)
 *
 * Docs: https://developer.puter.com/tutorials/free-unlimited-bytedance-seedream-api/
 */

import type { ImageGenerationConfig, ImageGenerationOptions, ImageGenerationResult } from '../types';

// ─── Puter.js minimal typings ──────────────────────────────────────────────

interface PuterTxt2ImgOptions {
  model?: string;
  provider?: string;
  disable_safety_checker?: boolean;
  width?: number;
  height?: number;
  seed?: number;
}

interface PuterAI {
  txt2img(prompt: string, options?: PuterTxt2ImgOptions): Promise<HTMLImageElement>;
}

interface PuterSDK {
  ai: PuterAI;
}

declare global {
  interface Window {
    puter?: PuterSDK;
  }
}

// ─── Constants ─────────────────────────────────────────────────────────────

const PUTER_SCRIPT_URL = 'https://js.puter.com/v2/';
const DEFAULT_MODEL = 'ByteDance-Seed/Seedream-4.0';
const PUTER_PROVIDER = 'together-ai';

// ─── Script loader ─────────────────────────────────────────────────────────

let _puterLoadPromise: Promise<void> | null = null;

/**
 * Ensures the Puter.js SDK is loaded in the browser.
 * Injects the <script> tag once and returns a promise that resolves when ready.
 */
function ensurePuterLoaded(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Puter.js requires a browser environment'));
  }

  // Already loaded
  if (window.puter) return Promise.resolve();

  // Already loading
  if (_puterLoadPromise) return _puterLoadPromise;

  _puterLoadPromise = new Promise<void>((resolve, reject) => {
    // Check if the script tag already exists (e.g. injected via layout)
    if (document.querySelector(`script[src="${PUTER_SCRIPT_URL}"]`) && !window.puter) {
      // Script tag exists but puter not yet available — wait via polling
      const interval = setInterval(() => {
        if (window.puter) {
          clearInterval(interval);
          resolve();
        }
      }, 100);
      setTimeout(() => {
        clearInterval(interval);
        reject(new Error('Puter.js failed to load within timeout'));
      }, 15_000);
      return;
    }

    const script = document.createElement('script');
    script.src = PUTER_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Puter.js SDK'));
    document.head.appendChild(script);

    // Poll for puter object in case onload fires before SDK is ready
    const interval = setInterval(() => {
      if (window.puter) {
        clearInterval(interval);
        resolve();
      }
    }, 100);

    // Overall timeout
    setTimeout(() => {
      clearInterval(interval);
      if (!window.puter) reject(new Error('Puter.js failed to initialize within timeout'));
    }, 15_000);
  });

  return _puterLoadPromise;
}

// ─── Dimension helpers ─────────────────────────────────────────────────────

/**
 * Map our aspect ratio / explicit dimensions to the nearest Seedream-safe
 * width × height.  Puter/together-ai Seedream works well with 512–1024 px
 * squares or common widescreen sizes.
 */
function resolveDimensions(options: ImageGenerationOptions): { width: number; height: number } {
  if (options.width && options.height) {
    return { width: options.width, height: options.height };
  }

  const ratio = options.aspectRatio;
  if (!ratio) return { width: 960, height: 960 };

  const map: Record<string, { width: number; height: number }> = {
    '16:9': { width: 960, height: 540 },
    '4:3':  { width: 960, height: 720 },
    '1:1':  { width: 960, height: 960 },
    '9:16': { width: 540, height: 960 },
  };

  return map[ratio] ?? { width: 960, height: 960 };
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Connectivity test — always succeeds for Puter Seedream since no API key
 * is required.  We just verify the SDK can be loaded.
 */
export async function testPuterSeedreamConnectivity(
  _config: ImageGenerationConfig,
): Promise<{ success: boolean; message: string }> {
  try {
    await ensurePuterLoaded();
    return { success: true, message: 'Puter.js loaded — Seedream ready (no API key required)' };
  } catch (err) {
    return { success: false, message: `Puter.js failed to load: ${err}` };
  }
}

/**
 * Generate an image using Puter.js + ByteDance Seedream.
 *
 * This runs ENTIRELY IN THE BROWSER — no server call is made.
 */
export async function generateWithPuterSeedream(
  config: ImageGenerationConfig,
  options: ImageGenerationOptions,
): Promise<ImageGenerationResult> {
  await ensurePuterLoaded();

  if (!window.puter?.ai?.txt2img) {
    throw new Error('Puter.js AI API is not available');
  }

  const model = config.model || DEFAULT_MODEL;
  const { width, height } = resolveDimensions(options);

  const imgElement = await window.puter.ai.txt2img(options.prompt, {
    model,
    provider: PUTER_PROVIDER,
    disable_safety_checker: true,
    width,
    height,
  });

  if (!imgElement?.src) {
    throw new Error('Puter Seedream returned an image element with no src');
  }

  return {
    url: imgElement.src,
    width,
    height,
  };
}
