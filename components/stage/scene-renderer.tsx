'use client';

import { useMemo } from 'react';
import type { Scene, StageMode } from '@/lib/types/stage';
import { SlideEditor as SlideRenderer } from '../slide-renderer/Editor';
import { QuizView } from '../scene-renderers/quiz-view';
// [INTERACTIVE DISABLED] import { InteractiveRenderer } from '../scene-renderers/interactive-renderer';
import { PBLRenderer } from '../scene-renderers/pbl-renderer';

interface SceneRendererProps {
  readonly scene: Scene;
  readonly mode: StageMode;
  readonly isSlideEditing?: boolean;
}

export function SceneRenderer({ scene, mode, isSlideEditing }: SceneRendererProps) {
  const renderer = useMemo(() => {
    switch (scene.type) {
      case 'slide':
        if (scene.content.type !== 'slide') return <div>Invalid slide content</div>;
        return <SlideRenderer mode={mode} isEditing={isSlideEditing} />;
      case 'quiz':
        if (scene.content.type !== 'quiz') return <div>Invalid quiz content</div>;
        return <QuizView key={scene.id} questions={scene.content.questions} sceneId={scene.id} />;
      // [INTERACTIVE DISABLED] Interactive learning functionality is disabled
      case 'interactive':
        return <div className="w-full h-full flex items-center justify-center bg-gray-50 dark:bg-gray-900"><p className="text-sm text-gray-400">Interactive content is disabled</p></div>;
        // if (scene.content.type !== 'interactive') return <div>Invalid interactive content</div>;
        // return <InteractiveRenderer content={scene.content} mode={mode} sceneId={scene.id} />;
      case 'pbl':
        if (scene.content.type !== 'pbl') return <div>Invalid PBL content</div>;
        return <PBLRenderer content={scene.content} mode={mode} sceneId={scene.id} />;
      default:
        return <div>Unknown scene type</div>;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, mode, isSlideEditing]);

  return <div className="w-full h-full">{renderer}</div>;
}
