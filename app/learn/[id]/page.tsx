'use client';

/**
 * /learn/[id] — Student / Learner View
 *
 * Loads a published classroom from the server by ID.
 * The ID in the URL is the only access control: only people who receive
 * the link from their instructor can view that classroom.
 *
 * Students get a read-only playback UI with no professor-specific tools.
 */

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { ThemeProvider } from '@/lib/hooks/use-theme';
import { useStageStore } from '@/lib/store';
import { useMediaGenerationStore } from '@/lib/store/media-generation';
import { useWhiteboardHistoryStore } from '@/lib/store/whiteboard-history';
import { MediaStageProvider } from '@/lib/contexts/media-stage-context';
import { prefetchAudioFiles, prefetchMediaFiles } from '@/lib/utils/classroom-prefetch';
import { StudentStage } from '@/components/student/student-stage';
import { createLogger } from '@/lib/logger';

const log = createLogger('LearnPage');

export default function LearnPage() {
  const params = useParams();
  const classroomId = params?.id as string;

  const [status, setStatus] = useState<'loading' | 'ready' | 'not-found' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadClassroom = useCallback(async () => {
    setStatus('loading');
    setErrorMsg(null);

    try {
      // Fetch from server (the only source — students have no local IndexedDB)
      const res = await fetch(`/api/classroom?id=${encodeURIComponent(classroomId)}`);

      if (res.status === 404) {
        setStatus('not-found');
        return;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const json = await res.json();
      if (!json.success || !json.classroom) {
        setStatus('not-found');
        return;
      }

      const { stage, scenes, audioUrls, mediaUrls } = json.classroom;

      useStageStore.getState().setStage(stage);
      useStageStore.setState({
        scenes,
        currentSceneId: scenes[0]?.id ?? null,
        // Force playback mode — students never generate or edit
        mode: 'playback',
      });

      log.info('Student view loaded classroom:', classroomId);

      // Pre-warm IndexedDB so the audio player and media store can resolve assets
      if (audioUrls && Object.keys(audioUrls).length > 0) {
        prefetchAudioFiles(audioUrls).catch((err) => log.warn('Audio prefetch error:', err));
      }
      if (mediaUrls && Object.keys(mediaUrls).length > 0) {
        prefetchMediaFiles(stage.id, mediaUrls).catch((err) => log.warn('Media prefetch error:', err));
      }

      setStatus('ready');
    } catch (err) {
      log.error('Failed to load classroom:', err);
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load classroom');
      setStatus('error');
    }
  }, [classroomId]);

  useEffect(() => {
    // Reset all stores to prevent stale state from other sessions
    const mediaStore = useMediaGenerationStore.getState();
    mediaStore.revokeObjectUrls();
    useMediaGenerationStore.setState({ tasks: {} });
    useWhiteboardHistoryStore.getState().clearHistory();

    loadClassroom();
  }, [classroomId, loadClassroom]);

  return (
    <ThemeProvider>
      <MediaStageProvider value={classroomId}>
        <div className="h-screen flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-900">
          {status === 'loading' && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-3">
                <div className="w-10 h-10 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-sm text-muted-foreground">Loading classroom…</p>
              </div>
            </div>
          )}

          {status === 'not-found' && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-4 max-w-sm px-6">
                <img src="/lys-logo.png" alt="LYS" className="h-12 w-auto mx-auto mb-4 opacity-60" />
                <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-200">
                  Classroom not found
                </h1>
                <p className="text-sm text-muted-foreground">
                  This classroom doesn&apos;t exist or has been unpublished by your instructor.
                  Please check the link or contact your instructor.
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-600 font-mono break-all">
                  ID: {classroomId}
                </p>
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-4 max-w-sm px-6">
                <h1 className="text-lg font-semibold text-destructive">Something went wrong</h1>
                <p className="text-sm text-muted-foreground">{errorMsg}</p>
                <button
                  onClick={loadClassroom}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-xl transition-colors"
                >
                  Try again
                </button>
              </div>
            </div>
          )}

          {status === 'ready' && <StudentStage />}
        </div>
      </MediaStageProvider>
    </ThemeProvider>
  );
}
