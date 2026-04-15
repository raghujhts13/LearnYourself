/**
 * Slide Q&A API
 *
 * POST: Receives the current slide context (title, key points, speech transcript)
 *       and a user question. Returns a streaming AI response.
 */

import { NextRequest } from 'next/server';
import { streamLLM } from '@/lib/ai/llm';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';
import { apiError } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';

const log = createLogger('SlideQA');

interface QARequest {
  question: string;
  slideTitle: string;
  slideContent: string; // speech transcript / key points extracted by the client
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

const SYSTEM_PROMPT = `You are a helpful teaching assistant integrated into an interactive lecture platform.

The user is viewing a presentation slide and asking questions about it.
Answer clearly and concisely in a conversational, educational tone.
- If the question is directly about the slide content, answer based on the provided context.
- If the question asks for elaboration or deeper explanation, expand thoughtfully.
- If the question is off-topic, gently redirect back to the slide material.
- Keep answers focused: 2–4 sentences for simple questions, up to a short paragraph for complex ones.
- Do not make up information not implied by the slide context.`;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as QARequest;
    const { question, slideTitle, slideContent, conversationHistory = [] } = body;

    if (!question?.trim()) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'question is required');
    }

    const { model: languageModel } = await resolveModelFromHeaders(req);

    const contextBlock = [
      `**Current Slide: "${slideTitle}"**`,
      '',
      slideContent
        ? `**Slide Content / Transcript:**\n${slideContent.slice(0, 3000)}`
        : '(No slide content available)',
    ].join('\n');

    // Build message history: prior exchanges + new question with slide context
    const fullMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      ...conversationHistory.slice(-8),
      { role: 'user', content: `Slide context:\n${contextBlock}\n\n---\n\nQuestion: ${question}` },
    ];

    const result = streamLLM(
      {
        model: languageModel,
        system: SYSTEM_PROMPT,
        messages: fullMessages,
        maxTokens: 600,
      },
      'slide-qa',
    );

    // Stream plain text back; client reads via ReadableStream reader
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of result.textStream) {
            controller.enqueue(encoder.encode(chunk));
          }
        } catch (err) {
          controller.error(err);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  } catch (error) {
    log.error('Slide Q&A failed:', error);
    if (error instanceof Error && error.message.includes('Invalid model selection')) {
      return apiError('INVALID_REQUEST', 400, error.message);
    }
    return apiError('INTERNAL_ERROR', 500, 'Failed to answer question');
  }
}
