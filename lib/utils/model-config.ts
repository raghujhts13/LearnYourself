import { useSettingsStore } from '@/lib/store/settings';

/**
 * Get current model configuration from settings store
 */
export function getCurrentModelConfig() {
  const { providerId, modelId, providersConfig } = useSettingsStore.getState();

  const selectedProvider = providersConfig[providerId];
  const selectedModelId =
    modelId && selectedProvider?.models?.some((m) => m.id === modelId)
      ? modelId
      : selectedProvider?.models?.[0]?.id || '';

  // Fall back to first usable provider+model when selection is empty/stale
  const fallbackEntry = Object.entries(providersConfig).find(([, cfg]) => {
    const hasModel = (cfg.models?.length || 0) > 0;
    const isUsable = !!cfg.apiKey || !!cfg.isServerConfigured || cfg.requiresApiKey === false;
    return hasModel && isUsable;
  });

  const effectiveProviderId =
    selectedProvider && selectedModelId ? providerId : (fallbackEntry?.[0] as typeof providerId);
  const providerConfig =
    (effectiveProviderId ? providersConfig[effectiveProviderId] : undefined) || selectedProvider;
  const effectiveModelId =
    selectedModelId || providerConfig?.models?.[0]?.id || modelId || 'gpt-4o-mini';
  const modelString = `${effectiveProviderId || 'openai'}:${effectiveModelId}`;

  return {
    providerId: effectiveProviderId || providerId,
    modelId: effectiveModelId,
    modelString,
    apiKey: providerConfig?.apiKey || '',
    baseUrl: providerConfig?.baseUrl || '',
    providerType: providerConfig?.type,
    requiresApiKey: providerConfig?.requiresApiKey,
    isServerConfigured: providerConfig?.isServerConfigured,
  };
}
