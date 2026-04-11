'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, MessageCircleQuestion, X, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getCurrentModelConfig } from '@/lib/utils/model-config';
import type { Scene } from '@/lib/types/stage';
import type { SpeechAction } from '@/lib/types/action';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface QASidebarProps {
  readonly scene: Scene | null;
  readonly onClose: () => void;
}

/** Extract speech transcript from a scene's actions */
function extractSlideContent(scene: Scene | null): string {
  if (!scene) return '';
  const speeches = (scene.actions ?? [])
    .filter((a): a is SpeechAction => a.type === 'speech')
    .map((a) => a.text);
  return speeches.join('\n\n');
}

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

export function QASidebar({ scene, onClose }: QASidebarProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Scroll to bottom whenever messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Clear messages when scene changes
  useEffect(() => {
    setMessages([]);
  }, [scene?.id]);

  const buildHeaders = useCallback((): Record<string, string> => {
    const modelConfig = getCurrentModelConfig();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-model': modelConfig.modelString,
      'x-api-key': modelConfig.apiKey,
    };
    if (modelConfig.baseUrl) headers['x-base-url'] = modelConfig.baseUrl;
    if (modelConfig.providerType) headers['x-provider-type'] = modelConfig.providerType;
    return headers;
  }, []);

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMsg: Message = { id: generateId(), role: 'user', content: trimmed };
    const assistantMsg: Message = { id: generateId(), role: 'assistant', content: '' };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput('');
    setIsLoading(true);

    const history = messages.slice(-8).map((m) => ({ role: m.role, content: m.content }));

    abortRef.current = new AbortController();

    try {
      const response = await fetch('/api/slide-qa', {
        method: 'POST',
        headers: buildHeaders(),
        signal: abortRef.current.signal,
        body: JSON.stringify({
          question: trimmed,
          slideTitle: scene?.title ?? 'Unknown Slide',
          slideContent: extractSlideContent(scene),
          conversationHistory: history,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Plain text stream — append each decoded chunk directly
        const chunk = decoder.decode(value, { stream: true });
        accumulated += chunk;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id ? { ...m, content: accumulated } : m,
          ),
        );
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? { ...m, content: 'Sorry, I encountered an error. Please try again.' }
              : m,
          ),
        );
      }
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  }, [input, isLoading, messages, scene, buildHeaders]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleClear = () => {
    abortRef.current?.abort();
    setMessages([]);
    setIsLoading(false);
  };

  return (
    <div className="flex flex-col w-80 shrink-0 border-l border-gray-200/60 dark:border-gray-700/60 bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm h-full">
      {/* Header */}
      <div className="flex items-center gap-2 h-12 px-4 border-b border-gray-200/60 dark:border-gray-700/60 shrink-0">
        <MessageCircleQuestion className="w-4 h-4 text-purple-500 shrink-0" />
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex-1">
          Ask About This Slide
        </span>
        {messages.length > 0 && (
          <button
            onClick={handleClear}
            title="Clear conversation"
            className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={onClose}
          title="Close Q&A"
          className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Slide context badge */}
      {scene && (
        <div className="px-4 py-2 bg-purple-50/60 dark:bg-purple-900/10 border-b border-purple-100/60 dark:border-purple-900/20 shrink-0">
          <p className="text-[11px] text-purple-600 dark:text-purple-400 font-medium truncate">
            {scene.title}
          </p>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-8">
            <MessageCircleQuestion className="w-8 h-8 text-gray-300 dark:text-gray-600" />
            <p className="text-sm text-gray-400 dark:text-gray-500 leading-relaxed">
              Ask any question about the current slide&apos;s content, concepts, or explanations.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              'flex gap-2',
              msg.role === 'user' ? 'justify-end' : 'justify-start',
            )}
          >
            <div
              className={cn(
                'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                msg.role === 'user'
                  ? 'bg-purple-600 text-white rounded-br-sm'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-bl-sm',
              )}
            >
              {msg.content || (
                <span className="inline-flex gap-1 items-center text-gray-400">
                  <span className="w-1 h-1 rounded-full bg-current animate-bounce [animation-delay:0ms]" />
                  <span className="w-1 h-1 rounded-full bg-current animate-bounce [animation-delay:150ms]" />
                  <span className="w-1 h-1 rounded-full bg-current animate-bounce [animation-delay:300ms]" />
                </span>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="shrink-0 px-3 py-3 border-t border-gray-200/60 dark:border-gray-700/60">
        <div className="flex items-end gap-2 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question… (Enter to send)"
            disabled={isLoading}
            className={cn(
              'flex-1 resize-none bg-transparent text-sm text-gray-700 dark:text-gray-300',
              'placeholder:text-gray-400 dark:placeholder:text-gray-600',
              'outline-none border-none max-h-24 min-h-[20px]',
              isLoading && 'opacity-50',
            )}
            style={{ height: 'auto' }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
            }}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            className={cn(
              'shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all',
              input.trim() && !isLoading
                ? 'bg-purple-600 text-white hover:bg-purple-700 active:scale-95'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed',
            )}
          >
            {isLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
