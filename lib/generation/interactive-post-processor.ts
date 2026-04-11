// [INTERACTIVE DISABLED] Interactive learning functionality is disabled.
// This module is kept as a stub to prevent import errors.
// The original implementation handled LaTeX delimiter conversion and KaTeX injection.

/**
 * Interactive HTML Post-Processor (DISABLED)
 *
 * Originally ported from Python's PostProcessor class (learn-your-way/concept_to_html.py:287-385)
 *
 * Handled:
 * - LaTeX delimiter conversion ($$...$$ -> \[...\], $...$ -> \(...\))
 * - KaTeX CSS/JS injection with auto-render and MutationObserver
 * - Script tag protection during LaTeX conversion
 */

/**
 * Main entry point: post-process generated interactive HTML (DISABLED - returns input unchanged)
 */
export function postProcessInteractiveHtml(html: string): string {
  return html;
}

// Original implementation (convertLatexDelimiters + injectKatex) has been
// commented out. See git history for the full source.
