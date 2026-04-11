// [INTERACTIVE DISABLED] Interactive learning functionality is disabled.
// This component is kept as a stub to prevent import errors.
// The original implementation rendered interactive HTML content in an iframe.

'use client';

// import { useMemo } from 'react';
import type { InteractiveContent } from '@/lib/types/stage';

interface InteractiveRendererProps {
  readonly content: InteractiveContent;
  readonly mode: 'autonomous' | 'playback';
  readonly sceneId: string;
}

export function InteractiveRenderer({ content: _content, mode: _mode, sceneId: _sceneId }: InteractiveRendererProps) {
  // [INTERACTIVE DISABLED] Original implementation commented out below
  return (
    <div className="w-full h-full relative flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <p className="text-sm text-gray-400 dark:text-gray-500">Interactive content is disabled</p>
    </div>
  );
}

/*
// Original InteractiveRenderer implementation:

export function InteractiveRenderer_Original({ content, mode: _mode, sceneId }: InteractiveRendererProps) {
  const patchedHtml = useMemo(
    () => (content.html ? patchHtmlForIframe(content.html) : undefined),
    [content.html],
  );

  return (
    <div className="w-full h-full relative">
      <iframe
        srcDoc={patchedHtml}
        src={patchedHtml ? undefined : content.url}
        className="absolute inset-0 w-full h-full border-0"
        title={`Interactive Scene ${sceneId}`}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      />
    </div>
  );
}

function patchHtmlForIframe(html: string): string {
  const iframeCss = `<style data-iframe-patch>
  html, body {
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    overflow-x: hidden;
    overflow-y: auto;
  }
  body { min-height: 100vh; }
</style>`;

  const headIdx = html.indexOf('<head>');
  if (headIdx !== -1) {
    const insertPos = headIdx + 6;
    return html.substring(0, insertPos) + '\n' + iframeCss + html.substring(insertPos);
  }

  const headWithAttrs = html.indexOf('<head ');
  if (headWithAttrs !== -1) {
    const closeAngle = html.indexOf('>', headWithAttrs);
    if (closeAngle !== -1) {
      const insertPos = closeAngle + 1;
      return html.substring(0, insertPos) + '\n' + iframeCss + html.substring(insertPos);
    }
  }

  return iframeCss + html;
}
*/
