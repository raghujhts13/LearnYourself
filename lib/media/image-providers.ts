/**
 * Image Generation Service -- routes to provider adapters
 */

import type {
  ImageProviderId,
  ImageGenerationConfig,
  ImageGenerationOptions,
  ImageGenerationResult,
  ImageProviderConfig,
} from './types';
import { generateWithSeedream, testSeedreamConnectivity } from './adapters/seedream-adapter';
import { generateWithNanoBanana, testNanoBananaConnectivity } from './adapters/nano-banana-adapter';
import {
  generateWithPuterSeedream,
  testPuterSeedreamConnectivity,
} from './adapters/puter-seedream-adapter';

export const IMAGE_PROVIDERS: Record<ImageProviderId, ImageProviderConfig> = {
  seedream: {
    id: 'seedream',
    name: 'Seedream',
    requiresApiKey: true,
    defaultBaseUrl: 'https://ark.cn-beijing.volces.com',
    models: [
      { id: 'doubao-seedream-5-0-260128', name: 'Seedream 5.0 Lite' },
      { id: 'doubao-seedream-4-5-251128', name: 'Seedream 4.5' },
      { id: 'doubao-seedream-4-0-250828', name: 'Seedream 4.0' },
      { id: 'doubao-seedream-3-0-t2i-250415', name: 'Seedream 3.0' },
    ],
    supportedAspectRatios: ['16:9', '4:3', '1:1', '9:16'],
  },
  'nano-banana': {
    id: 'nano-banana',
    name: 'Nano Banana (Gemini)',
    requiresApiKey: true,
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    models: [
      {
        id: 'gemini-3.1-flash-image-preview',
        name: 'Gemini 3.1 Flash Image (Nano Banana 2)',
      },
      {
        id: 'gemini-3-pro-image-preview',
        name: 'Gemini 3 Pro Image (Nano Banana Pro)',
      },
      {
        id: 'gemini-2.5-flash-image',
        name: 'Gemini 2.5 Flash Image (Nano Banana)',
      },
    ],
    supportedAspectRatios: ['16:9', '4:3', '1:1'],
  },
  'puter-seedream': {
    id: 'puter-seedream',
    name: 'Seedream via Puter (Free)',
    requiresApiKey: false,
    models: [
      { id: 'ByteDance-Seed/Seedream-4.0', name: 'Seedream 4.0 (Free)' },
      { id: 'ByteDance-Seed/Seedream-3.0', name: 'Seedream 3.0 (Free)' },
    ],
    supportedAspectRatios: ['16:9', '4:3', '1:1', '9:16'],
  },
};

export async function testImageConnectivity(
  config: ImageGenerationConfig,
): Promise<{ success: boolean; message: string }> {
  switch (config.providerId) {
    case 'seedream':
      return testSeedreamConnectivity(config);
    case 'nano-banana':
      return testNanoBananaConnectivity(config);
    case 'puter-seedream':
      return testPuterSeedreamConnectivity(config);
    default:
      return {
        success: false,
        message: `Unsupported image provider: ${config.providerId}`,
      };
  }
}

export async function generateImage(
  config: ImageGenerationConfig,
  options: ImageGenerationOptions,
): Promise<ImageGenerationResult> {
  switch (config.providerId) {
    case 'seedream':
      return generateWithSeedream(config, options);
    case 'nano-banana':
      return generateWithNanoBanana(config, options);
    case 'puter-seedream':
      return generateWithPuterSeedream(config, options);
    default:
      throw new Error(`Unsupported image provider: ${config.providerId}`);
  }
}

export function aspectRatioToDimensions(
  ratio: string,
  maxWidth = 1024,
): { width: number; height: number } {
  const [w, h] = ratio.split(':').map(Number);
  if (!w || !h) return { width: maxWidth, height: Math.round((maxWidth * 9) / 16) };
  return { width: maxWidth, height: Math.round((maxWidth * h) / w) };
}
