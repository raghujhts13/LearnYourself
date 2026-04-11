/**
 * Unified AI Provider Configuration
 *
 * Supports multiple AI providers through Vercel AI SDK:
 * - OpenAI (native)
 * - Anthropic Claude (native)
 * - Ollama (OpenAI-compatible, local)
 *
 * Sources:
 * - https://platform.openai.com/docs/models
 * - https://platform.claude.com/docs/en/about-claude/models/overview
 */

import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import type { LanguageModel } from 'ai';
import type {
  ProviderId,
  ProviderConfig,
  ModelInfo,
  ModelConfig,
  ThinkingConfig,
} from '@/lib/types/provider';
import { createLogger } from '@/lib/logger';
// NOTE: Do NOT import thinking-context.ts here — it uses node:async_hooks
// which is server-only, and this file is also used on the client via
// settings.ts. The thinking context is read from globalThis instead
// (set by thinking-context.ts at module load time on the server).

const log = createLogger('AIProviders');

// Re-export types for backward compatibility
export type { ProviderId, ProviderConfig, ModelInfo, ModelConfig };

/** Provider IDs whose logos are monochrome-dark and need `dark:invert` in dark mode */
export const MONO_LOGO_PROVIDERS: ReadonlySet<string> = new Set(['openai', 'ollama']);

/**
 * Provider registry
 */
export const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  openai: {
    id: 'openai',
    name: 'OpenAI',
    type: 'openai',
    defaultBaseUrl: 'https://api.openai.com/v1',
    requiresApiKey: true,
    icon: '/logos/openai.svg',
    models: [
      {
        id: 'gpt-5.2',
        name: 'GPT-5.2',
        contextWindow: 400000,
        outputWindow: 128000,
        capabilities: {
          streaming: true,
          tools: true,
          vision: true,
          thinking: {
            toggleable: true,
            budgetAdjustable: true,
            defaultEnabled: false,
          },
        },
      },
      {
        id: 'gpt-5.1',
        name: 'GPT-5.1',
        contextWindow: 400000,
        outputWindow: 128000,
        capabilities: {
          streaming: true,
          tools: true,
          vision: true,
          thinking: {
            toggleable: true,
            budgetAdjustable: true,
            defaultEnabled: false,
          },
        },
      },
      {
        id: 'gpt-5',
        name: 'GPT-5',
        contextWindow: 400000,
        outputWindow: 128000,
        capabilities: {
          streaming: true,
          tools: true,
          vision: true,
          thinking: {
            toggleable: false,
            budgetAdjustable: true,
            defaultEnabled: true,
          },
        },
      },
      {
        id: 'gpt-5-mini',
        name: 'GPT-5-mini',
        contextWindow: 128000,
        outputWindow: 4096,
        capabilities: {
          streaming: true,
          tools: true,
          vision: true,
          thinking: {
            toggleable: false,
            budgetAdjustable: true,
            defaultEnabled: true,
          },
        },
      },
      {
        id: 'gpt-5-nano',
        name: 'GPT-5-nano',
        contextWindow: 128000,
        outputWindow: 4096,
        capabilities: {
          streaming: true,
          tools: true,
          vision: true,
          thinking: {
            toggleable: false,
            budgetAdjustable: true,
            defaultEnabled: true,
          },
        },
      },
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        contextWindow: 128000,
        outputWindow: 4096,
        capabilities: { streaming: true, tools: true, vision: true },
      },
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o-mini',
        contextWindow: 128000,
        outputWindow: 4096,
        capabilities: { streaming: true, tools: true, vision: true },
      },
      {
        id: 'gpt-4-turbo',
        name: 'GPT-4-turbo',
        contextWindow: 128000,
        outputWindow: 4096,
        capabilities: { streaming: true, tools: true, vision: true },
      },

      {
        id: 'o4-mini',
        name: 'o4-mini',
        contextWindow: 200000,
        outputWindow: 100000,
        capabilities: {
          streaming: true,
          tools: true,
          vision: false,
          thinking: {
            toggleable: false,
            budgetAdjustable: true,
            defaultEnabled: true,
          },
        },
      },
      {
        id: 'o3',
        name: 'o3',
        contextWindow: 200000,
        outputWindow: 100000,
        capabilities: {
          streaming: true,
          tools: true,
          vision: false,
          thinking: {
            toggleable: false,
            budgetAdjustable: true,
            defaultEnabled: true,
          },
        },
      },
      {
        id: 'o3-mini',
        name: 'o3-mini',
        contextWindow: 200000,
        outputWindow: 100000,
        capabilities: {
          streaming: true,
          tools: true,
          vision: false,
          thinking: {
            toggleable: false,
            budgetAdjustable: true,
            defaultEnabled: true,
          },
        },
      },
      {
        id: 'o1',
        name: 'o1',
        contextWindow: 200000,
        outputWindow: 100000,
        capabilities: {
          streaming: true,
          tools: false,
          vision: false,
          thinking: {
            toggleable: false,
            budgetAdjustable: true,
            defaultEnabled: true,
          },
        },
      },
    ],
  },

  anthropic: {
    id: 'anthropic',
    name: 'Claude',
    type: 'anthropic',
    requiresApiKey: true,
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    icon: '/logos/claude.svg',
    models: [
      {
        id: 'claude-opus-4-6',
        name: 'Claude Opus 4.6',
        contextWindow: 200000,
        outputWindow: 128000,
        capabilities: {
          streaming: true,
          tools: true,
          vision: true,
          thinking: {
            toggleable: true,
            budgetAdjustable: true,
            defaultEnabled: false,
          },
        },
      },
      {
        id: 'claude-sonnet-4-6',
        name: 'Claude Sonnet 4.6',
        contextWindow: 200000,
        outputWindow: 128000,
        capabilities: {
          streaming: true,
          tools: true,
          vision: true,
          thinking: {
            toggleable: true,
            budgetAdjustable: true,
            defaultEnabled: false,
          },
        },
      },
      {
        id: 'claude-sonnet-4-5',
        name: 'Claude Sonnet 4.5',
        contextWindow: 200000,
        outputWindow: 64000,
        capabilities: {
          streaming: true,
          tools: true,
          vision: true,
          thinking: {
            toggleable: true,
            budgetAdjustable: true,
            defaultEnabled: false,
          },
        },
      },
      {
        id: 'claude-haiku-4-5',
        name: 'Claude Haiku 4.5',
        contextWindow: 200000,
        outputWindow: 64000,
        capabilities: {
          streaming: true,
          tools: true,
          vision: true,
          thinking: {
            toggleable: true,
            budgetAdjustable: true,
            defaultEnabled: false,
          },
        },
      },
    ],
  },

  ollama: {
    id: 'ollama',
    name: 'Ollama',
    type: 'openai',
    defaultBaseUrl: 'http://localhost:11434/v1',
    requiresApiKey: false,
    icon: '/logos/ollama.svg',
    models: [
      {
        id: 'llama3.3',
        name: 'Llama 3.3 70B',
        contextWindow: 131072,
        outputWindow: 4096,
        capabilities: { streaming: true, tools: true, vision: false },
      },
      {
        id: 'llama3.2',
        name: 'Llama 3.2 3B',
        contextWindow: 131072,
        outputWindow: 4096,
        capabilities: { streaming: true, tools: true, vision: false },
      },
      {
        id: 'qwen2.5',
        name: 'Qwen 2.5 7B',
        contextWindow: 131072,
        outputWindow: 8192,
        capabilities: { streaming: true, tools: true, vision: false },
      },
      {
        id: 'qwen2.5:32b',
        name: 'Qwen 2.5 32B',
        contextWindow: 131072,
        outputWindow: 8192,
        capabilities: { streaming: true, tools: true, vision: false },
      },
      {
        id: 'mistral',
        name: 'Mistral 7B',
        contextWindow: 32768,
        outputWindow: 4096,
        capabilities: { streaming: true, tools: false, vision: false },
      },
      {
        id: 'gemma3',
        name: 'Gemma 3 12B',
        contextWindow: 131072,
        outputWindow: 8192,
        capabilities: { streaming: true, tools: true, vision: true },
      },
      {
        id: 'deepseek-r1',
        name: 'DeepSeek R1',
        contextWindow: 131072,
        outputWindow: 8192,
        capabilities: { streaming: true, tools: false, vision: false },
      },
      {
        id: 'phi4',
        name: 'Phi-4 14B',
        contextWindow: 16384,
        outputWindow: 4096,
        capabilities: { streaming: true, tools: false, vision: false },
      },
    ],
  },
};

/**
 * Get provider config (from built-in or unified config in localStorage)
 */
function getProviderConfig(providerId: ProviderId): ProviderConfig | null {
  // Check built-in providers first
  if (PROVIDERS[providerId]) {
    return PROVIDERS[providerId];
  }

  // Check unified providersConfig in localStorage (browser only)
  if (typeof window !== 'undefined') {
    try {
      const storedConfig = localStorage.getItem('providersConfig');
      if (storedConfig) {
        const config = JSON.parse(storedConfig);
        const providerSettings = config[providerId];
        if (providerSettings) {
          return {
            id: providerId,
            name: providerSettings.name,
            type: providerSettings.type,
            defaultBaseUrl: providerSettings.defaultBaseUrl,
            icon: providerSettings.icon,
            requiresApiKey: providerSettings.requiresApiKey,
            models: providerSettings.models,
          };
        }
      }
    } catch (e) {
      log.error('Failed to load provider config:', e);
    }
  }

  return null;
}

/**
 * Model instance with its configuration info
 */
export interface ModelWithInfo {
  model: LanguageModel;
  modelInfo: ModelInfo | null;
}

/**
 * Return vendor-specific body params to inject for OpenAI-compatible providers.
 * Called from the custom fetch wrapper inside getModel().
 */
function getCompatThinkingBodyParams(
  _providerId: ProviderId,
  _config: ThinkingConfig,
): Record<string, unknown> | undefined {
  // No vendor-specific thinking params needed for remaining providers
  return undefined;
}

/** Returns true if the provider requires an API key (defaults to true for unknown providers). */
export function isProviderKeyRequired(providerId: string): boolean {
  return getProviderConfig(providerId as ProviderId)?.requiresApiKey ?? true;
}

/**
 * Get a configured language model instance with its info
 * Accepts individual parameters for flexibility and security
 */
export function getModel(config: ModelConfig): ModelWithInfo {
  // providerType can come from client for custom providers; fall back to registry.
  let providerType = config.providerType;
  const provider = getProviderConfig(config.providerId);
  const requiresApiKey = provider?.requiresApiKey ?? true;

  if (!providerType) {
    if (provider) {
      providerType = provider.type;
    } else {
      throw new Error(`Unknown provider: ${config.providerId}. Please provide providerType.`);
    }
  }

  // Validate API key if required
  if (requiresApiKey && !config.apiKey) {
    throw new Error(`API key required for provider: ${config.providerId}`);
  }

  // Use provided API key, or empty string for providers that don't require one
  const effectiveApiKey = config.apiKey || '';

  // Resolve base URL: explicit > provider default > SDK default
  const effectiveBaseUrl = config.baseUrl || provider?.defaultBaseUrl || undefined;

  let model: LanguageModel;

  switch (providerType) {
    case 'openai': {
      const openaiOptions: Parameters<typeof createOpenAI>[0] = {
        apiKey: effectiveApiKey,
        baseURL: effectiveBaseUrl,
      };

      // For OpenAI-compatible providers (not native OpenAI), add a fetch
      // wrapper that injects vendor-specific thinking params into the HTTP
      // body. The thinking config is read from AsyncLocalStorage, set by
      // callLLM / streamLLM at call time.
      if (config.providerId !== 'openai') {
        const providerId = config.providerId;
        openaiOptions.fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
          // Read thinking config from globalThis (set by thinking-context.ts)
          const thinkingCtx = (globalThis as Record<string, unknown>).__thinkingContext as
            | { getStore?: () => unknown }
            | undefined;
          const thinking = thinkingCtx?.getStore?.() as ThinkingConfig | undefined;
          if (thinking && init?.body && typeof init.body === 'string') {
            const extra = getCompatThinkingBodyParams(providerId, thinking);
            if (extra) {
              try {
                const body = JSON.parse(init.body);
                Object.assign(body, extra);
                init = { ...init, body: JSON.stringify(body) };
              } catch {
                /* leave body as-is */
              }
            }
          }
          return globalThis.fetch(url, init);
        };
      }

      const openai = createOpenAI(openaiOptions);
      model = openai.chat(config.modelId);
      break;
    }

    case 'anthropic': {
      const anthropic = createAnthropic({
        apiKey: effectiveApiKey,
        baseURL: effectiveBaseUrl,
      });
      model = anthropic.chat(config.modelId);
      break;
    }

    default:
      throw new Error(`Unsupported provider type: ${providerType}`);
  }

  // Look up model info from the provider registry
  const modelInfo = provider?.models.find((m) => m.id === config.modelId) || null;

  return { model, modelInfo };
}

/**
 * Parse model string in format "providerId:modelId" or just "modelId" (defaults to OpenAI)
 */
export function parseModelString(modelString: string): {
  providerId: ProviderId;
  modelId: string;
} {
  // Split only on the first colon to handle model IDs that contain colons
  const colonIndex = modelString.indexOf(':');

  if (colonIndex > 0) {
    return {
      providerId: modelString.slice(0, colonIndex) as ProviderId,
      modelId: modelString.slice(colonIndex + 1),
    };
  }

  // Default to OpenAI for backward compatibility
  return {
    providerId: 'openai',
    modelId: modelString,
  };
}

/**
 * Get all available models grouped by provider
 */
export function getAllModels(): {
  provider: ProviderConfig;
  models: ModelInfo[];
}[] {
  return Object.values(PROVIDERS).map((provider) => ({
    provider,
    models: provider.models,
  }));
}

/**
 * Get provider by ID
 */
export function getProvider(providerId: ProviderId): ProviderConfig | undefined {
  return PROVIDERS[providerId];
}

/**
 * Get model info
 */
export function getModelInfo(providerId: ProviderId, modelId: string): ModelInfo | undefined {
  const provider = PROVIDERS[providerId];
  return provider?.models.find((m) => m.id === modelId);
}
