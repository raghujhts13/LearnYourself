/**
 * Builds GeneratedSlideContent from a PPT-sourced outline without AI.
 *
 * Used in "from-slides" generation mode to turn each PPT slide's extracted
 * text into a simple slide layout — no LLM calls are made.
 * The AI is still used downstream to generate teaching transcripts (speech actions).
 */

import { nanoid } from 'nanoid';
import type { SceneOutline, GeneratedSlideContent } from '@/lib/types/generation';
import type { PPTTextElement } from '@/lib/types/slides';

const CANVAS_W = 1000;
const CANVAS_H = 562.5;
const MARGIN = 60;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Build a GeneratedSlideContent from a PPT slide outline.
 *
 * Layout:
 *   - Bold centred title at the top
 *   - Bulleted key points (or description text) below
 *   - Plain white background
 *
 * The resulting content is compatible with the standard scene pipeline —
 * it is passed directly to /api/generate/scene-actions so the AI can
 * generate teaching transcripts based on the slide text.
 */
export function buildSlideContentFromOutline(outline: SceneOutline): GeneratedSlideContent {
  const elements: PPTTextElement[] = [];

  // ── Title ──
  elements.push({
    id: `text_${nanoid(8)}`,
    type: 'text',
    left: MARGIN,
    top: 40,
    width: CANVAS_W - MARGIN * 2,
    height: 90,
    rotate: 0,
    content: `<p style="text-align:center;font-size:30px;font-weight:bold;color:#1a1a1a">${escapeHtml(outline.title)}</p>`,
    defaultFontName: 'Arial',
    defaultColor: '#1a1a1a',
  });

  // ── Body: key points as bullet list, or description fallback ──
  const bodyLines =
    outline.keyPoints && outline.keyPoints.length > 0
      ? outline.keyPoints
      : outline.description
        ? [outline.description]
        : [];

  if (bodyLines.length > 0) {
    const bodyHtml = bodyLines
      .filter(Boolean)
      .map((line) => `<p style="margin:0 0 10px 0">• ${escapeHtml(line)}</p>`)
      .join('');

    elements.push({
      id: `text_${nanoid(8)}`,
      type: 'text',
      left: MARGIN,
      top: 155,
      width: CANVAS_W - MARGIN * 2,
      height: CANVAS_H - 155 - MARGIN,
      rotate: 0,
      content: `<div style="font-size:19px;line-height:1.75;color:#333333">${bodyHtml}</div>`,
      defaultFontName: 'Arial',
      defaultColor: '#333333',
    });
  }

  return {
    elements: elements as GeneratedSlideContent['elements'],
    background: { type: 'solid', color: '#ffffff' },
    remark: outline.description || outline.title,
  };
}
