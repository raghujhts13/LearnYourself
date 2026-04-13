/**
 * Web Search API
 *
 * POST /api/web-search
 * Supports Tavily (default) and Claude web search providers.
 */

import { NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import { searchWithTavily, formatSearchResultsAsContext } from '@/lib/web-search/tavily';
import { searchWithClaude } from '@/lib/web-search/claude';
import { resolveWebSearchApiKey } from '@/lib/server/provider-config';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import {
  buildSearchQuery,
  SEARCH_QUERY_REWRITE_EXCERPT_LENGTH,
} from '@/lib/server/search-query-builder';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';
import type { AICallFn } from '@/lib/generation/pipeline-types';

const log = createLogger('WebSearch');

export async function POST(req: NextRequest) {
  let query: string | undefined;
  try {
    const body = await req.json();
    const {
      query: requestQuery,
      pdfText,
      apiKey: clientApiKey,
      providerId = 'tavily',
      modelId,
    } = body as {
      query?: string;
      pdfText?: string;
      apiKey?: string;
      providerId?: string;
      modelId?: string;
    };
    query = requestQuery;

    if (!query || !query.trim()) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'query is required');
    }

    const apiKey = resolveWebSearchApiKey(providerId, clientApiKey);
    if (!apiKey) {
      const hint =
        providerId === 'claude'
          ? 'Anthropic API key is not configured. Set it in Settings → Web Search → Claude or set ANTHROPIC_API_KEY env var.'
          : 'Tavily API key is not configured. Set it in Settings → Web Search or set TAVILY_API_KEY env var.';
      return apiError('MISSING_API_KEY', 400, hint);
    }

    // Clamp rewrite input at the route boundary; framework body limits still apply to total request size.
    const boundedPdfText = pdfText?.slice(0, SEARCH_QUERY_REWRITE_EXCERPT_LENGTH);

    let aiCall: AICallFn | undefined;
    try {
      const { model: languageModel } = await resolveModelFromHeaders(req);
      aiCall = async (systemPrompt, userPrompt) => {
        const result = await callLLM(
          {
            model: languageModel,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            maxOutputTokens: 256,
          },
          'web-search-query-rewrite',
        );
        return result.text;
      };
    } catch (error) {
      log.warn('Search query rewrite model unavailable, falling back to raw requirement:', error);
    }

    // Claude web search builds its own query internally; skip the rewrite step for it.
    const isClaude = providerId === 'claude';
    const searchQuery = isClaude
      ? { query: query.trim(), hasPdfContext: false, rawRequirementLength: query.length, rewriteAttempted: false, finalQueryLength: query.trim().length }
      : await buildSearchQuery(query, boundedPdfText, aiCall);

    log.info(`Running web search API request [provider=${providerId}]`, {
      hasPdfContext: searchQuery.hasPdfContext,
      rawRequirementLength: searchQuery.rawRequirementLength,
      rewriteAttempted: searchQuery.rewriteAttempted,
      finalQueryLength: searchQuery.finalQueryLength,
    });

    let result;
    if (isClaude) {
      result = await searchWithClaude({ query: searchQuery.query, apiKey, modelId });
    } else {
      result = await searchWithTavily({ query: searchQuery.query, apiKey });
    }

    const context = formatSearchResultsAsContext(result);

    return apiSuccess({
      answer: result.answer,
      sources: result.sources,
      context,
      query: result.query,
      responseTime: result.responseTime,
    });
  } catch (err) {
    log.error(`Web search failed [query="${query?.substring(0, 60) ?? 'unknown'}"]:`, err);
    const message = err instanceof Error ? err.message : 'Web search failed';
    return apiError('INTERNAL_ERROR', 500, message);
  }
}
