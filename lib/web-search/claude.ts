/**
 * Claude Web Search Integration
 *
 * Uses Anthropic's built-in web search tool via the AI SDK.
 * Claude searches the web natively and synthesises a summary.
 * Requires an Anthropic API key.
 */

import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import type { WebSearchResult, WebSearchSource } from '@/lib/types/web-search';

const CLAUDE_SEARCH_MODEL_OPTIONS = ['claude-sonnet-4-6', 'claude-opus-4-6'] as const;
type ClaudeWebSearchModelId = (typeof CLAUDE_SEARCH_MODEL_OPTIONS)[number];
const DEFAULT_CLAUDE_SEARCH_MODEL: ClaudeWebSearchModelId = 'claude-sonnet-4-6';

function normalizeClaudeWebSearchModelId(modelId?: string): ClaudeWebSearchModelId {
  if (!modelId) return DEFAULT_CLAUDE_SEARCH_MODEL;
  return (CLAUDE_SEARCH_MODEL_OPTIONS as readonly string[]).includes(modelId)
    ? (modelId as ClaudeWebSearchModelId)
    : DEFAULT_CLAUDE_SEARCH_MODEL;
}

/**
 * Search the web using Claude's built-in web search tool.
 * Returns a structured result compatible with the shared WebSearchResult interface.
 */
export async function searchWithClaude(params: {
  query: string;
  apiKey: string;
  modelId?: string;
  maxUses?: number;
}): Promise<WebSearchResult> {
  const { query, apiKey, modelId, maxUses = 3 } = params;
  const startTime = Date.now();
  const resolvedModelId = normalizeClaudeWebSearchModelId(modelId);

  const provider = createAnthropic({ apiKey });

  const { text, toolResults } = await generateText({
    model: provider(resolvedModelId),
    tools: {
      webSearch: provider.tools.webSearch_20260209({ maxUses }),
    },
    messages: [
      {
        role: 'user',
        content:
          `Search the web and provide a concise, informative summary about: ${query}` +
          `\n\nInclude specific facts and relevant details. Cite your sources.`,
      },
    ],
    maxSteps: maxUses + 2,
  } as Parameters<typeof generateText>[0]);

  // Extract unique sources from all web search tool results (webSearch_20260209).
  // Cast through unknown: TypedToolResult uses `output` (not `result`) and the
  // DynamicToolResult union branch doesn't expose it at the TypeScript level.
  const rawResults = (toolResults ?? []) as unknown as Array<{
    toolName: string;
    output: unknown;
  }>;
  const sources: WebSearchSource[] = [];
  const seenUrls = new Set<string>();

  for (const result of rawResults) {
    if (result.toolName !== 'webSearch') continue;

    const items = result.output as Array<{
      type: string;
      url: string;
      title: string | null;
      pageAge: string | null;
      encryptedContent: string;
    }>;

    if (!Array.isArray(items)) continue;

    for (const item of items) {
      if (!item?.url || seenUrls.has(item.url)) continue;
      seenUrls.add(item.url);
      sources.push({
        title: item.title || item.url,
        url: item.url,
        content: '',
        score: 1,
      });
    }
  }

  return {
    answer: text,
    sources,
    query,
    responseTime: (Date.now() - startTime) / 1000,
  };
}
