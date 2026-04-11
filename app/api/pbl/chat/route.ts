/**
 * PBL Chat API
 *
 * POST: Receives a student message and agent context, returns the AI agent's response.
 *       Handles both Question Agents (guidance) and Judge Agents (completion assessment).
 */

import { NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';
import type { PBLAgent, PBLIssue } from '@/lib/pbl/types';

const log = createLogger('PBLChat');

interface RecentMessage {
  agent_name: string;
  message: string;
}

interface PBLChatRequest {
  message: string;
  agent: PBLAgent;
  currentIssue: PBLIssue | null;
  recentMessages: RecentMessage[];
  userRole: string;
  agentType?: 'question' | 'judge';
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as PBLChatRequest;
    const { message, agent, currentIssue, recentMessages = [], userRole, agentType } = body;

    if (!message?.trim()) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'message is required');
    }
    if (!agent?.system_prompt) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'agent with system_prompt is required');
    }

    const { model: languageModel } = resolveModelFromHeaders(req);

    // Start with the agent's own system prompt
    let systemPrompt = agent.system_prompt;

    // Append current issue context
    if (currentIssue) {
      systemPrompt += `\n\n## Current Issue\nTitle: ${currentIssue.title}\nDescription: ${currentIssue.description}\nPerson in Charge: ${currentIssue.person_in_charge}`;
      if (currentIssue.participants.length > 0) {
        systemPrompt += `\nParticipants: ${currentIssue.participants.join(', ')}`;
      }
      if (currentIssue.notes) {
        systemPrompt += `\nNotes: ${currentIssue.notes}`;
      }
    }

    // Judge agent: append evaluation-specific instructions
    if (agentType === 'judge' && currentIssue) {
      systemPrompt += `\n\n## Evaluation Task\nAssess whether the student's contribution satisfies the requirements for this issue.\nRespond with:\n- "COMPLETE" if the work is satisfactory and the issue can be closed.\n- "NEEDS_REVISION: <specific feedback>" if improvements are required.`;
    }

    // Build conversation from recent message history
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    for (const msg of recentMessages.slice(-10)) {
      if (msg.agent_name === userRole) {
        messages.push({ role: 'user', content: msg.message });
      } else if (msg.agent_name === agent.name) {
        messages.push({ role: 'assistant', content: msg.message });
      }
    }
    messages.push({ role: 'user', content: message });

    const result = await callLLM(
      {
        model: languageModel,
        system: systemPrompt,
        messages,
        maxTokens: 800,
      },
      'pbl-chat',
    );

    return apiSuccess({ message: result.text });
  } catch (error) {
    log.error('PBL chat failed:', error);
    return apiError('INTERNAL_ERROR', 500, 'Failed to generate agent response');
  }
}
