/**
 * Audio Provider Constants
 *
 * Registry of all TTS and ASR providers with their metadata.
 * Separated from tts-providers.ts and asr-providers.ts to avoid importing
 * Node.js libraries (like sharp, buffer) in client components.
 *
 * This file is client-safe and can be imported in both client and server components.
 *
 * To add a new provider:
 * 1. Add the provider ID to TTSProviderId or ASRProviderId in types.ts
 * 2. Add provider configuration to TTS_PROVIDERS or ASR_PROVIDERS below
 * 3. Implement provider logic in tts-providers.ts or asr-providers.ts
 * 4. Add i18n translations in lib/i18n.ts
 *
 * Provider configuration should include:
 * - id: Unique identifier matching the type definition
 * - name: Display name for the provider
 * - requiresApiKey: Whether the provider needs an API key
 * - defaultBaseUrl: Default API endpoint (optional)
 * - icon: Path to provider icon (optional)
 * - models: Available model choices (empty array if no model concept)
 * - defaultModelId: Default model ID (empty string if no models)
 * - voices: Array of available voices (TTS only)
 * - supportedFormats: Audio formats supported by the provider
 * - speedRange: Min/max/default speed settings (TTS only)
 * - supportedLanguages: Languages supported by the provider (ASR only)
 */

import type {
  TTSProviderId,
  TTSProviderConfig,
  TTSVoiceInfo,
  ASRProviderId,
  ASRProviderConfig,
} from './types';

/**
 * TTS Provider Registry
 *
 * Central registry for all TTS providers.
 * Keep in sync with TTSProviderId type definition.
 */
export const TTS_PROVIDERS: Record<TTSProviderId, TTSProviderConfig> = {
  'openai-tts': {
    id: 'openai-tts',
    name: 'OpenAI TTS',
    requiresApiKey: true,
    defaultBaseUrl: 'https://api.openai.com/v1',
    icon: '/logos/openai.svg',
    models: [
      { id: 'gpt-4o-mini-tts', name: 'GPT-4o Mini TTS' },
      { id: 'tts-1', name: 'TTS-1' },
      { id: 'tts-1-hd', name: 'TTS-1 HD' },
    ],
    defaultModelId: 'gpt-4o-mini-tts',
    voices: [
      // Recommended voices (best quality)
      {
        id: 'marin',
        name: 'Marin',
        language: 'en',
        gender: 'neutral',
        description: 'voiceMarin',
        compatibleModels: ['gpt-4o-mini-tts'],
      },
      {
        id: 'cedar',
        name: 'Cedar',
        language: 'en',
        gender: 'neutral',
        description: 'voiceCedar',
        compatibleModels: ['gpt-4o-mini-tts'],
      },
      // Standard voices (alphabetical)
      {
        id: 'alloy',
        name: 'Alloy',
        language: 'en',
        gender: 'neutral',
        description: 'voiceAlloy',
      },
      {
        id: 'ash',
        name: 'Ash',
        language: 'en',
        gender: 'neutral',
        description: 'voiceAsh',
      },
      {
        id: 'ballad',
        name: 'Ballad',
        language: 'en',
        gender: 'neutral',
        description: 'voiceBallad',
      },
      {
        id: 'coral',
        name: 'Coral',
        language: 'en',
        gender: 'neutral',
        description: 'voiceCoral',
      },
      {
        id: 'echo',
        name: 'Echo',
        language: 'en',
        gender: 'male',
        description: 'voiceEcho',
      },
      {
        id: 'fable',
        name: 'Fable',
        language: 'en',
        gender: 'neutral',
        description: 'voiceFable',
      },
      {
        id: 'nova',
        name: 'Nova',
        language: 'en',
        gender: 'female',
        description: 'voiceNova',
      },
      {
        id: 'onyx',
        name: 'Onyx',
        language: 'en',
        gender: 'male',
        description: 'voiceOnyx',
      },
      {
        id: 'sage',
        name: 'Sage',
        language: 'en',
        gender: 'neutral',
        description: 'voiceSage',
      },
      {
        id: 'shimmer',
        name: 'Shimmer',
        language: 'en',
        gender: 'female',
        description: 'voiceShimmer',
      },
      {
        id: 'verse',
        name: 'Verse',
        language: 'en',
        gender: 'neutral',
        description: 'voiceVerse',
      },
    ],
    supportedFormats: ['mp3', 'opus', 'aac', 'flac'],
    speedRange: { min: 0.25, max: 4.0, default: 1.0 },
  },
  'elevenlabs-tts': {
    id: 'elevenlabs-tts',
    name: 'ElevenLabs TTS',
    requiresApiKey: true,
    defaultBaseUrl: 'https://api.elevenlabs.io/v1',
    icon: '/logos/elevenlabs.svg',
    models: [
      { id: 'eleven_multilingual_v2', name: 'Multilingual v2' },
      { id: 'eleven_flash_v2_5', name: 'Flash v2.5' },
      { id: 'eleven_flash_v2', name: 'Flash v2' },
    ],
    defaultModelId: 'eleven_multilingual_v2',
    // Free-tier-safe fallback set; account-specific/custom voices should come from /v2/voices dynamically later.
    voices: [
      {
        id: 'EXAVITQu4vr4xnSDxMaL',
        name: 'Sarah',
        language: 'en-US',
        gender: 'female',
        description: 'Confident and warm professional voice for clear narration',
      },
      {
        id: 'Xb7hH8MSUJpSbSDYk0k2',
        name: 'Alice',
        language: 'en-GB',
        gender: 'female',
        description: 'Clear and engaging British educator voice for e-learning',
      },
      {
        id: 'XrExE9yKIg1WjnnlVkGX',
        name: 'Matilda',
        language: 'en-US',
        gender: 'female',
        description: 'Knowledgeable and upbeat voice suited for lectures',
      },
      {
        id: 'CwhRBWXzGAHq8TQ4Fs17',
        name: 'Roger',
        language: 'en-US',
        gender: 'male',
        description: 'Laid-back but resonant male voice for friendly lessons',
      },
      {
        id: 'cjVigY5qzO86Huf0OWal',
        name: 'Eric',
        language: 'en-US',
        gender: 'male',
        description: 'Smooth and trustworthy voice for polished classroom audio',
      },
      {
        id: 'onwK4e9ZLuTAKqWW03F9',
        name: 'Daniel',
        language: 'en-GB',
        gender: 'male',
        description: 'Steady British broadcaster voice for formal explanations',
      },
      {
        id: 'SAz9YHcvj6GT2YYXdXww',
        name: 'River',
        language: 'en-US',
        gender: 'neutral',
        description: 'Relaxed and informative neutral voice for general narration',
      },
    ],
    supportedFormats: ['mp3', 'opus', 'pcm', 'wav', 'ulaw', 'alaw'],
    speedRange: { min: 0.7, max: 1.2, default: 1.0 },
  },

  'browser-native-tts': {
    id: 'browser-native-tts',
    name: '浏览器原生 (Web Speech API)',
    requiresApiKey: false,
    icon: '/logos/browser.svg',
    models: [],
    defaultModelId: '',
    voices: [
      // Note: Actual voices are determined by the browser and OS
      // These are placeholder - real voices are fetched dynamically via speechSynthesis.getVoices()
      { id: 'default', name: '默认', language: 'zh-CN', gender: 'neutral' },
    ],
    supportedFormats: ['browser'], // Browser native audio
    speedRange: { min: 0.1, max: 10.0, default: 1.0 },
  },

  'puter-tts': {
    id: 'puter-tts',
    name: 'Puter TTS (Free)',
    requiresApiKey: false,
    icon: '/logos/doubao.svg', // Placeholder — replace with Puter logo if available
    models: [
      { id: 'neural', name: 'Neural (High Quality)' },
      { id: 'generative', name: 'Generative (Most Natural)' },
      { id: 'standard', name: 'Standard' },
    ],
    defaultModelId: 'neural',
    voices: [
      // Amazon Polly neural voices supported by Puter TTS
      { id: 'Joanna', name: 'Joanna', language: 'en-US', gender: 'female' },
      { id: 'Matthew', name: 'Matthew', language: 'en-US', gender: 'male' },
      { id: 'Ivy', name: 'Ivy', language: 'en-US', gender: 'female' },
      { id: 'Justin', name: 'Justin', language: 'en-US', gender: 'male' },
      { id: 'Kendra', name: 'Kendra', language: 'en-US', gender: 'female' },
      { id: 'Kimberly', name: 'Kimberly', language: 'en-US', gender: 'female' },
      { id: 'Salli', name: 'Salli', language: 'en-US', gender: 'female' },
      { id: 'Joey', name: 'Joey', language: 'en-US', gender: 'male' },
      { id: 'Celine', name: 'Céline', language: 'fr-FR', gender: 'female' },
      { id: 'Mathieu', name: 'Mathieu', language: 'fr-FR', gender: 'male' },
      { id: 'Marlene', name: 'Marlene', language: 'de-DE', gender: 'female' },
      { id: 'Hans', name: 'Hans', language: 'de-DE', gender: 'male' },
      { id: 'Conchita', name: 'Conchita', language: 'es-ES', gender: 'female' },
      { id: 'Enrique', name: 'Enrique', language: 'es-ES', gender: 'male' },
      { id: 'Giorgio', name: 'Giorgio', language: 'it-IT', gender: 'male' },
      { id: 'Carla', name: 'Carla', language: 'it-IT', gender: 'female' },
    ],
    supportedFormats: ['mp3'],
    speedRange: { min: 0.5, max: 2.0, default: 1.0 },
  },

  'azure-tts': {
    id: 'azure-tts',
    name: 'Azure Speech',
    requiresApiKey: true,
    defaultBaseUrl: 'https://eastus.tts.speech.microsoft.com',
    icon: '/logos/azure.svg',
    models: [],
    defaultModelId: '',
    voices: [{ id: 'zh-CN-XiaoxiaoNeural', name: 'Xiaoxiao', language: 'zh-CN', gender: 'female' }],
    supportedFormats: ['mp3'],
    speedRange: { min: 0.5, max: 2.0, default: 1.0 },
  },

  'glm-tts': {
    id: 'glm-tts',
    name: 'GLM TTS',
    requiresApiKey: true,
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    icon: '/logos/glm.svg',
    models: [{ id: 'glm-tts', name: 'GLM TTS' }],
    defaultModelId: 'glm-tts',
    voices: [{ id: 'tongtong', name: 'Tongtong', language: 'zh', gender: 'female' }],
    supportedFormats: ['wav'],
    speedRange: { min: 0.5, max: 2.0, default: 1.0 },
  },

  'qwen-tts': {
    id: 'qwen-tts',
    name: 'Qwen TTS',
    requiresApiKey: true,
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/api/v1',
    icon: '/logos/qwen.svg',
    models: [{ id: 'qwen3-tts-flash', name: 'Qwen3 TTS Flash' }],
    defaultModelId: 'qwen3-tts-flash',
    voices: [{ id: 'Cherry', name: 'Cherry', language: 'zh', gender: 'female' }],
    supportedFormats: ['wav'],
    speedRange: { min: 0.5, max: 2.0, default: 1.0 },
  },

  'minimax-tts': {
    id: 'minimax-tts',
    name: 'MiniMax TTS',
    requiresApiKey: true,
    defaultBaseUrl: 'https://api.minimaxi.com',
    icon: '/logos/minimax.svg',
    models: [{ id: 'speech-2.8-hd', name: 'Speech 2.8 HD' }],
    defaultModelId: 'speech-2.8-hd',
    voices: [{ id: 'male-qn-qingse', name: 'Qingse (male)', language: 'zh', gender: 'male' }],
    supportedFormats: ['mp3'],
    speedRange: { min: 0.5, max: 2.0, default: 1.0 },
  },

  'doubao-tts': {
    id: 'doubao-tts',
    name: 'Doubao TTS',
    requiresApiKey: true,
    defaultBaseUrl: 'https://openspeech.bytedance.com/api/v1/tts',
    icon: '/logos/doubao.svg',
    models: [{ id: 'seed-tts-2.0', name: 'Seed TTS 2.0' }],
    defaultModelId: 'seed-tts-2.0',
    voices: [{ id: 'zh_female_shuangkuaisisi_moon_bigtts', name: 'Shuangkuaisisi', language: 'zh' }],
    supportedFormats: ['mp3'],
    speedRange: { min: 0.5, max: 2.0, default: 1.0 },
  },
};

/**
 * ASR Provider Registry
 *
 * Central registry for all ASR providers.
 * Keep in sync with ASRProviderId type definition.
 */
export const ASR_PROVIDERS: Record<ASRProviderId, ASRProviderConfig> = {
  'openai-whisper': {
    id: 'openai-whisper',
    name: 'OpenAI Whisper',
    requiresApiKey: true,
    defaultBaseUrl: 'https://api.openai.com/v1',
    icon: '/logos/openai.svg',
    models: [
      { id: 'gpt-4o-mini-transcribe', name: 'GPT-4o Mini Transcribe' },
      { id: 'gpt-4o-transcribe', name: 'GPT-4o Transcribe' },
      { id: 'whisper-1', name: 'Whisper-1' },
    ],
    defaultModelId: 'gpt-4o-mini-transcribe',
    supportedLanguages: [
      // OpenAI Whisper supports 58 languages (as of official docs)
      // Source: https://platform.openai.com/docs/guides/speech-to-text
      'auto', // Auto-detect
      // Hot languages (commonly used)
      'zh', // Chinese
      'en', // English
      'ja', // Japanese
      'ko', // Korean
      'es', // Spanish
      'fr', // French
      'de', // German
      'ru', // Russian
      'ar', // Arabic
      'pt', // Portuguese
      'it', // Italian
      'hi', // Hindi
      // Other languages (alphabetical)
      'af', // Afrikaans
      'hy', // Armenian
      'az', // Azerbaijani
      'be', // Belarusian
      'bs', // Bosnian
      'bg', // Bulgarian
      'ca', // Catalan
      'hr', // Croatian
      'cs', // Czech
      'da', // Danish
      'nl', // Dutch
      'et', // Estonian
      'fi', // Finnish
      'gl', // Galician
      'el', // Greek
      'he', // Hebrew
      'hu', // Hungarian
      'is', // Icelandic
      'id', // Indonesian
      'kn', // Kannada
      'kk', // Kazakh
      'lv', // Latvian
      'lt', // Lithuanian
      'mk', // Macedonian
      'ms', // Malay
      'mr', // Marathi
      'mi', // Maori
      'ne', // Nepali
      'no', // Norwegian
      'fa', // Persian
      'pl', // Polish
      'ro', // Romanian
      'sr', // Serbian
      'sk', // Slovak
      'sl', // Slovenian
      'sw', // Swahili
      'sv', // Swedish
      'tl', // Tagalog
      'ta', // Tamil
      'th', // Thai
      'tr', // Turkish
      'uk', // Ukrainian
      'ur', // Urdu
      'vi', // Vietnamese
      'cy', // Welsh
    ],
    supportedFormats: ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm'],
  },

  'qwen-asr': {
    id: 'qwen-asr',
    name: 'Qwen ASR (阿里云百炼)',
    requiresApiKey: true,
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/api/v1',
    icon: '/logos/bailian.svg',
    models: [{ id: 'qwen3-asr-flash', name: 'Qwen3 ASR Flash' }],
    defaultModelId: 'qwen3-asr-flash',
    supportedLanguages: [
      // Qwen ASR supports 27 languages + auto-detect
      // If language is uncertain or mixed (e.g. Chinese-English-Japanese-Korean), use "auto" (do not specify language parameter)
      'auto', // Auto-detect (do not specify language parameter)
      // Hot languages (commonly used)
      'zh', // Chinese (Mandarin, Sichuanese, Minnan, Wu dialects)
      'yue', // Cantonese
      'en', // English
      'ja', // Japanese
      'ko', // Korean
      'de', // German
      'fr', // French
      'ru', // Russian
      'es', // Spanish
      'pt', // Portuguese
      'ar', // Arabic
      'it', // Italian
      'hi', // Hindi
      // Other languages (alphabetical)
      'cs', // Czech
      'da', // Danish
      'fi', // Finnish
      'fil', // Filipino
      'id', // Indonesian
      'is', // Icelandic
      'ms', // Malay
      'no', // Norwegian
      'pl', // Polish
      'sv', // Swedish
      'th', // Thai
      'tr', // Turkish
      'uk', // Ukrainian
      'vi', // Vietnamese
    ],
    supportedFormats: ['mp3', 'wav', 'webm', 'm4a', 'flac'],
  },

  'browser-native': {
    id: 'browser-native',
    name: '浏览器原生 ASR (Web Speech API)',
    requiresApiKey: false,
    icon: '/logos/browser.svg',
    models: [],
    defaultModelId: '',
    supportedLanguages: [
      // Chinese variants
      'zh-CN', // Mandarin (Simplified, China)
      'zh-TW', // Mandarin (Traditional, Taiwan)
      'zh-HK', // Cantonese (Hong Kong)
      'yue-Hant-HK', // Cantonese (Traditional)
      // English variants
      'en-US', // English (United States)
      'en-GB', // English (United Kingdom)
      'en-AU', // English (Australia)
      'en-CA', // English (Canada)
      'en-IN', // English (India)
      'en-NZ', // English (New Zealand)
      'en-ZA', // English (South Africa)
      // Japanese & Korean
      'ja-JP', // Japanese (Japan)
      'ko-KR', // Korean (South Korea)
      // European languages
      'de-DE', // German (Germany)
      'fr-FR', // French (France)
      'es-ES', // Spanish (Spain)
      'es-MX', // Spanish (Mexico)
      'es-AR', // Spanish (Argentina)
      'es-CO', // Spanish (Colombia)
      'it-IT', // Italian (Italy)
      'pt-BR', // Portuguese (Brazil)
      'pt-PT', // Portuguese (Portugal)
      'ru-RU', // Russian (Russia)
      'nl-NL', // Dutch (Netherlands)
      'pl-PL', // Polish (Poland)
      'cs-CZ', // Czech (Czech Republic)
      'da-DK', // Danish (Denmark)
      'fi-FI', // Finnish (Finland)
      'sv-SE', // Swedish (Sweden)
      'no-NO', // Norwegian (Norway)
      'tr-TR', // Turkish (Turkey)
      'el-GR', // Greek (Greece)
      'hu-HU', // Hungarian (Hungary)
      'ro-RO', // Romanian (Romania)
      'sk-SK', // Slovak (Slovakia)
      'bg-BG', // Bulgarian (Bulgaria)
      'hr-HR', // Croatian (Croatia)
      'ca-ES', // Catalan (Spain)
      // Middle East & Asia
      'ar-SA', // Arabic (Saudi Arabia)
      'ar-EG', // Arabic (Egypt)
      'he-IL', // Hebrew (Israel)
      'hi-IN', // Hindi (India)
      'th-TH', // Thai (Thailand)
      'vi-VN', // Vietnamese (Vietnam)
      'id-ID', // Indonesian (Indonesia)
      'ms-MY', // Malay (Malaysia)
      'fil-PH', // Filipino (Philippines)
      // Other
      'af-ZA', // Afrikaans (South Africa)
      'uk-UA', // Ukrainian (Ukraine)
    ],
    supportedFormats: ['webm'], // MediaRecorder format
  },

  'puter-asr': {
    id: 'puter-asr',
    name: 'Puter ASR (Free)',
    requiresApiKey: false,
    icon: '/logos/openai.svg', // Powered by OpenAI Whisper/GPT-4o under the hood
    models: [
      { id: 'gpt-4o-mini-transcribe', name: 'GPT-4o Mini Transcribe (Fast)' },
      { id: 'gpt-4o-transcribe', name: 'GPT-4o Transcribe (High Quality)' },
      { id: 'whisper-1', name: 'Whisper-1' },
    ],
    defaultModelId: 'gpt-4o-mini-transcribe',
    supportedLanguages: [
      'auto', 'zh', 'en', 'ja', 'ko', 'es', 'fr', 'de', 'ru', 'ar', 'pt', 'it', 'hi',
      'af', 'hy', 'az', 'be', 'bs', 'bg', 'ca', 'hr', 'cs', 'da', 'nl', 'et', 'fi',
      'gl', 'el', 'he', 'hu', 'is', 'id', 'kn', 'kk', 'lv', 'lt', 'mk', 'ms', 'mr',
      'mi', 'ne', 'no', 'fa', 'pl', 'ro', 'sr', 'sk', 'sl', 'sw', 'sv', 'tl', 'ta',
      'th', 'tr', 'uk', 'ur', 'vi', 'cy',
    ],
    supportedFormats: ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm'],
  },
};

/**
 * Get all available TTS providers
 */
export function getAllTTSProviders(): TTSProviderConfig[] {
  return Object.values(TTS_PROVIDERS);
}

/**
 * Get TTS provider by ID
 */
export function getTTSProvider(providerId: TTSProviderId): TTSProviderConfig | undefined {
  return TTS_PROVIDERS[providerId];
}

/**
 * Default voice for each TTS provider.
 * Used when switching providers or testing a non-active provider.
 */
export const DEFAULT_TTS_VOICES: Record<TTSProviderId, string> = {
  'openai-tts': 'alloy',
  'elevenlabs-tts': 'EXAVITQu4vr4xnSDxMaL',
  'browser-native-tts': 'default',
  'puter-tts': 'Joanna',
  'azure-tts': 'zh-CN-XiaoxiaoNeural',
  'glm-tts': 'tongtong',
  'qwen-tts': 'Cherry',
  'minimax-tts': 'male-qn-qingse',
  'doubao-tts': 'zh_female_shuangkuaisisi_moon_bigtts',
};

export const DEFAULT_TTS_MODELS: Record<TTSProviderId, string> = {
  'openai-tts': 'gpt-4o-mini-tts',
  'elevenlabs-tts': 'eleven_multilingual_v2',
  'browser-native-tts': '',
  'puter-tts': 'neural',
  'azure-tts': '',
  'glm-tts': 'glm-tts',
  'qwen-tts': 'qwen3-tts-flash',
  'minimax-tts': 'speech-2.8-hd',
  'doubao-tts': 'seed-tts-2.0',
};

/**
 * Get voices for a specific TTS provider
 */
export function getTTSVoices(providerId: TTSProviderId): TTSVoiceInfo[] {
  return TTS_PROVIDERS[providerId]?.voices || [];
}

/**
 * Get all available ASR providers
 */
export function getAllASRProviders(): ASRProviderConfig[] {
  return Object.values(ASR_PROVIDERS);
}

/**
 * Get ASR provider by ID
 */
export function getASRProvider(providerId: ASRProviderId): ASRProviderConfig | undefined {
  return ASR_PROVIDERS[providerId];
}

/**
 * Get supported languages for a specific ASR provider
 */
export function getASRSupportedLanguages(providerId: ASRProviderId): string[] {
  return ASR_PROVIDERS[providerId]?.supportedLanguages || [];
}
