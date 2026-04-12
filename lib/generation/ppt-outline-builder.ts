/**
 * Builds scene outlines from parsed PPT/PPTX slides without AI.
 *
 * Used by the "from-slides" generation mode to convert uploaded presentations
 * into scene outlines deterministically — no LLM calls are made here.
 * Quiz outlines are optionally inserted between slide groups.
 */

import { nanoid } from 'nanoid';
import type { SceneOutline } from '@/lib/types/generation';

export interface PptSlideData {
  index: number;
  title?: string;
  text: string;
  notes?: string;
}

/**
 * Convert parsed PPT slides into scene outlines without AI.
 *
 * Rules:
 * - One 'slide' outline per PPT slide.
 * - If includeQuizzes is true, a 'quiz' outline is inserted after every 3rd slide,
 *   but never after the last slide (quizzes go *between* content, not at the end).
 */
export function buildOutlinesFromPptSlides(
  slides: PptSlideData[],
  language: 'zh-CN' | 'en-US',
  includeQuizzes: boolean,
): SceneOutline[] {
  const outlines: SceneOutline[] = [];
  let order = 1;

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const title =
      slide.title?.trim() ||
      (language === 'zh-CN' ? `幻灯片 ${i + 1}` : `Slide ${i + 1}`);

    // Extract bullet-point key points from body text, excluding repeated title
    const keyPoints = slide.text
      .split(/[\n\r]+/)
      .map((line) => line.trim())
      .filter(
        (line) =>
          line.length > 0 &&
          line.toLowerCase() !== title.toLowerCase() &&
          line.length < 300,
      )
      .slice(0, 8);

    outlines.push({
      id: nanoid(),
      type: 'slide',
      title,
      description: slide.text.substring(0, 300) || title,
      keyPoints,
      order: order++,
      language,
    });

    // Insert quiz after every 3rd slide — but never after the last slide
    if (includeQuizzes && (i + 1) % 3 === 0 && i < slides.length - 1) {
      const recentSlides = slides.slice(Math.max(0, i - 2), i + 1);
      const contextTitles = recentSlides
        .map((s) => s.title?.trim() || s.text.substring(0, 40))
        .filter(Boolean)
        .join(', ');

      outlines.push({
        id: nanoid(),
        type: 'quiz',
        title: language === 'zh-CN' ? '小测验' : 'Quiz',
        description:
          language === 'zh-CN'
            ? `根据以下内容出题：${contextTitles}`
            : `Quiz covering: ${contextTitles}`,
        keyPoints: recentSlides
          .map((s) => s.title?.trim() || s.text.substring(0, 80))
          .filter(Boolean),
        order: order++,
        language,
        quizConfig: {
          questionCount: 2,
          difficulty: 'medium',
          questionTypes: ['single', 'multiple'],
        },
      });
    }
  }

  return outlines;
}
