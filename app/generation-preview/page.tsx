'use client';

import { useEffect, useState, Suspense, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, Sparkles, AlertCircle, AlertTriangle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useStageStore } from '@/lib/store/stage';
import { useSettingsStore } from '@/lib/store/settings';
import { useI18n } from '@/lib/hooks/use-i18n';
import {
  loadImageMapping,
  loadPdfBlob,
  cleanupOldImages,
  storeImages,
} from '@/lib/utils/image-storage';
import { getCurrentModelConfig } from '@/lib/utils/model-config';
import { db } from '@/lib/utils/database';
import { MAX_PDF_CONTENT_CHARS, MAX_VISION_IMAGES } from '@/lib/constants/generation';
import { nanoid } from 'nanoid';
import type { Stage } from '@/lib/types/stage';
import type { SceneOutline, PdfImage, ImageMapping } from '@/lib/types/generation';
import { createLogger } from '@/lib/logger';
import { type GenerationSessionState, ALL_STEPS, getActiveSteps } from './types';
import { StepVisualizer } from './components/visualizers';
import { buildOutlinesFromPptSlides } from '@/lib/generation/ppt-outline-builder';
import { buildSlideContentFromOutline } from '@/lib/generation/ppt-slide-content-builder';

const log = createLogger('GenerationPreview');

function GenerationPreviewContent() {
  const router = useRouter();
  const { t } = useI18n();
  const hasStartedRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [session, setSession] = useState<GenerationSessionState | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isComplete] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [streamingOutlines, setStreamingOutlines] = useState<SceneOutline[] | null>(null);
  const [truncationWarnings, setTruncationWarnings] = useState<string[]>([]);
  const [webSearchSources, setWebSearchSources] = useState<Array<{ title: string; url: string }>>(
    [],
  );

  // Compute active steps based on session state
  const activeSteps = getActiveSteps(session);

  // Load session from sessionStorage
  useEffect(() => {
    cleanupOldImages(24).catch((e) => log.error(e));

    const saved = sessionStorage.getItem('generationSession');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as GenerationSessionState;
        setSession(parsed);
      } catch (e) {
        log.error('Failed to parse generation session:', e);
      }
    }
    setSessionLoaded(true);
  }, []);

  // Abort all in-flight requests on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // Get API credentials from localStorage
  const getApiHeaders = () => {
    const modelConfig = getCurrentModelConfig();
    const settings = useSettingsStore.getState();
    const imageProviderConfig = settings.imageProvidersConfig?.[settings.imageProviderId];
    return {
      'Content-Type': 'application/json',
      'x-model': modelConfig.modelString,
      'x-api-key': modelConfig.apiKey,
      'x-base-url': modelConfig.baseUrl,
      'x-provider-type': modelConfig.providerType || '',
      // Image generation provider
      'x-image-provider': settings.imageProviderId || '',
      'x-image-model': settings.imageModelId || '',
      'x-image-api-key': imageProviderConfig?.apiKey || '',
      'x-image-base-url': imageProviderConfig?.baseUrl || '',
      // Media generation toggles
      'x-image-generation-enabled': String(settings.imageGenerationEnabled ?? false),
      'x-video-generation-enabled': 'false',
    };
  };

  // Auto-start generation when session is loaded
  useEffect(() => {
    if (session && !hasStartedRef.current) {
      hasStartedRef.current = true;
      startGeneration();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // Main generation flow
  const startGeneration = async () => {
    if (!session) return;

    // Create AbortController for this generation run
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const signal = controller.signal;

    // Use a local mutable copy so we can update it after PDF parsing
    let currentSession = session;

    setError(null);
    setCurrentStepIndex(0);

    try {
      // Compute active steps for this session (recomputed after session mutations)
      let activeSteps = getActiveSteps(currentSession);

      const isFromSlidesMode = currentSession.requirements.generationMode === 'from-slides';

      // ── Normalize file list (multi-file aware, backward-compatible) ──
      type SourceFileEntry = import('./types').SourceFileEntry;
      const filesToProcess: SourceFileEntry[] =
        currentSession.sourceFiles && currentSession.sourceFiles.length > 0
          ? currentSession.sourceFiles
          : currentSession.pdfStorageKey
          ? [
              {
                storageKey: currentSession.pdfStorageKey,
                fileName: currentSession.pdfFileName || 'document',
                providerId: currentSession.pdfProviderId,
                providerConfig: currentSession.pdfProviderConfig,
              },
            ]
          : [];

      const hasFilesToProcess = filesToProcess.length > 0 && !currentSession.pdfText;

      if (!hasFilesToProcess) {
        const firstNonPdfIdx = activeSteps.findIndex((s) => s.id !== 'pdf-analysis');
        setCurrentStepIndex(Math.max(0, firstNonPdfIdx));
      }

      // Accumulators across all files
      let mergedText = '';
      const mergedRawImages: Array<{
        id: string; src: string; pageNumber: number;
        description?: string; width?: number; height?: number;
      }> = [];
      let pptDerivedOutlines: SceneOutline[] | null = null;
      const warnings: string[] = [];

      // ── Step 0: Parse all source files ──
      if (hasFilesToProcess) {
        log.debug(`=== Generation Preview: Parsing ${filesToProcess.length} file(s) ===`);
        const pdfAnalysisIdx = activeSteps.findIndex((s) => s.id === 'pdf-analysis');
        if (pdfAnalysisIdx >= 0) setCurrentStepIndex(pdfAnalysisIdx);

        for (let fi = 0; fi < filesToProcess.length; fi++) {
          const srcFile = filesToProcess[fi];
          const name = srcFile.fileName;
          const ext = name.toLowerCase().split('.').pop() ?? '';
          const isPdf = ext === 'pdf';
          const isPpt = ext === 'ppt' || ext === 'pptx';

          if (filesToProcess.length > 1) {
            setStatusMessage(`Parsing file ${fi + 1} of ${filesToProcess.length}: ${name}`);
          }

          const blob = await loadPdfBlob(srcFile.storageKey);
          if (!blob || !(blob instanceof Blob) || blob.size === 0) {
            log.warn(`Skipping file "${name}": blob not found or empty`);
            continue;
          }

          // ── PDF files in AI mode → parse-pdf (text + images) ──
          if (isPdf && !isFromSlidesMode) {
            const mimeType = 'application/pdf';
            const fileObj = new File([blob], name, { type: mimeType });
            const fd = new FormData();
            fd.append('pdf', fileObj);
            if (srcFile.providerId) fd.append('providerId', srcFile.providerId);
            if (srcFile.providerConfig?.apiKey?.trim())
              fd.append('apiKey', srcFile.providerConfig.apiKey!);
            if (srcFile.providerConfig?.baseUrl?.trim())
              fd.append('baseUrl', srcFile.providerConfig.baseUrl!);

            const res = await fetch('/api/parse-pdf', { method: 'POST', body: fd, signal });
            if (!res.ok) {
              const errData = await res.json().catch(() => ({}));
              throw new Error(errData.error || t('generation.pdfParseFailed'));
            }
            const result = await res.json();
            if (!result.success || !result.data) throw new Error(t('generation.pdfParseFailed'));

            const fileText: string = result.data.text ?? '';
            if (mergedText && fileText) mergedText += `\n\n--- ${name} ---\n\n`;
            mergedText += fileText;

            if (fileText.length > MAX_PDF_CONTENT_CHARS) {
              warnings.push(t('generation.textTruncated', { n: MAX_PDF_CONTENT_CHARS }));
            }

            const rawImgs = result.data.metadata?.pdfImages;
            const fileImages = rawImgs
              ? rawImgs.map(
                  (img: { id: string; src?: string; pageNumber?: number; description?: string; width?: number; height?: number }) => ({
                    id: img.id, src: img.src || '', pageNumber: img.pageNumber || 1,
                    description: img.description, width: img.width, height: img.height,
                  }),
                )
              : (result.data.images as string[]).map((src: string, i: number) => ({
                  id: `img_${fi}_${i + 1}`, src, pageNumber: 1,
                }));
            mergedRawImages.push(...fileImages);

          // ── PPT/PPTX in from-slides mode → parse-document (slides) ──
          } else if (isPpt && isFromSlidesMode) {
            const mimeType =
              ext === 'ppt'
                ? 'application/vnd.ms-powerpoint'
                : 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
            const fileObj = new File([blob], name, { type: mimeType });
            const fd = new FormData();
            fd.append('file', fileObj);

            const res = await fetch('/api/parse-document', { method: 'POST', body: fd, signal });
            if (res.ok) {
              const result = await res.json();
              if (result.success && result.data?.slides?.length > 0) {
                const outlines = buildOutlinesFromPptSlides(
                  result.data.slides,
                  currentSession.requirements.language,
                  currentSession.requirements.includeQuizzes ?? false,
                );
                log.debug(`Built ${outlines.length} outlines from "${name}"`);
                pptDerivedOutlines = [...(pptDerivedOutlines ?? []), ...outlines];
              }
              // Also absorb text as context
              if (result.data?.text) {
                if (mergedText) mergedText += `\n\n--- ${name} ---\n\n`;
                mergedText += result.data.text as string;
              }
            } else {
              log.warn(`Failed to parse PPT "${name}" for slides`);
            }

          // ── All other files (DOCX, TXT, PPT in AI mode, PDF in from-slides mode) → parse-document (text) ──
          } else if (!isPdf || isFromSlidesMode) {
            let mimeType = 'application/octet-stream';
            if (isPdf) mimeType = 'application/pdf';
            else if (ext === 'docx')
              mimeType =
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
            else if (ext === 'txt') mimeType = 'text/plain';
            else if (isPpt)
              mimeType =
                ext === 'ppt'
                  ? 'application/vnd.ms-powerpoint'
                  : 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

            const fileObj = new File([blob], name, { type: mimeType });
            const fd = new FormData();
            fd.append('file', fileObj);

            const res = await fetch('/api/parse-document', { method: 'POST', body: fd, signal });
            if (res.ok) {
              const result = await res.json();
              if (result.success && result.data?.text) {
                if (mergedText) mergedText += `\n\n--- ${name} ---\n\n`;
                mergedText += result.data.text as string;
              }
            } else {
              log.warn(`Failed to parse document "${name}"`);
            }
          }
        }

        // Re-number image IDs to avoid collisions across files
        mergedRawImages.forEach((img, i) => { img.id = `img_${i + 1}`; });

        // Truncate combined text
        if (mergedText.length > MAX_PDF_CONTENT_CHARS) {
          mergedText = mergedText.substring(0, MAX_PDF_CONTENT_CHARS);
          if (!warnings.some((w) => w.includes('truncated')))
            warnings.push(t('generation.textTruncated', { n: MAX_PDF_CONTENT_CHARS }));
        }
        if (mergedRawImages.length > MAX_VISION_IMAGES) {
          warnings.push(
            t('generation.imageTruncated', {
              total: mergedRawImages.length,
              max: MAX_VISION_IMAGES,
            }),
          );
        }

        // Store images
        const imageStorageIds = await storeImages(mergedRawImages);
        const pdfImages: PdfImage[] = mergedRawImages.map((img, i) => ({
          id: img.id,
          src: '',
          pageNumber: img.pageNumber,
          description: img.description,
          width: img.width,
          height: img.height,
          storageId: imageStorageIds[i],
        }));

        const updatedSession = {
          ...currentSession,
          pdfText: mergedText,
          pdfImages,
          imageStorageIds,
        };
        setSession(updatedSession);
        sessionStorage.setItem('generationSession', JSON.stringify(updatedSession));

        if (warnings.length > 0) setTruncationWarnings(warnings);

        currentSession = updatedSession;
        activeSteps = getActiveSteps(currentSession);
        setStatusMessage('');
      }

      // ── Step: Web Search (if enabled) ──
      const webSearchStepIdx = activeSteps.findIndex((s) => s.id === 'web-search');
      if (currentSession.requirements.webSearch && webSearchStepIdx >= 0) {
        setCurrentStepIndex(webSearchStepIdx);
        setWebSearchSources([]);

        const wsSettings = useSettingsStore.getState();
        const wsProviderId = wsSettings.webSearchProviderId;
        const wsModelId = wsSettings.webSearchProvidersConfig?.[wsProviderId]?.modelId;
        let wsApiKey = wsSettings.webSearchProvidersConfig?.[wsProviderId]?.apiKey;
        // For Claude: fall back to the Anthropic LLM key if no dedicated web search key is set
        if (!wsApiKey && wsProviderId === 'claude') {
          wsApiKey =
            (wsSettings.providersConfig as Record<string, { apiKey?: string }>)?.anthropic?.apiKey ||
            '';
        }
        const res = await fetch('/api/web-search', {
          method: 'POST',
          headers: getApiHeaders(),
          body: JSON.stringify({
            query: currentSession.requirements.requirement,
            pdfText: currentSession.pdfText || undefined,
            apiKey: wsApiKey || undefined,
            providerId: wsProviderId,
            modelId: wsProviderId === 'claude' ? wsModelId : undefined,
          }),
          signal,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: 'Web search failed' }));
          throw new Error(data.error || t('generation.webSearchFailed'));
        }

        const searchData = await res.json();
        const sources = (searchData.sources || []).map((s: { title: string; url: string }) => ({
          title: s.title,
          url: s.url,
        }));
        setWebSearchSources(sources);

        const updatedSessionWithSearch = {
          ...currentSession,
          researchContext: searchData.context || '',
          researchSources: sources,
        };
        setSession(updatedSessionWithSearch);
        sessionStorage.setItem('generationSession', JSON.stringify(updatedSessionWithSearch));
        currentSession = updatedSessionWithSearch;
        activeSteps = getActiveSteps(currentSession);
      }

      // Load imageMapping early (needed for both outline and scene generation)
      let imageMapping: ImageMapping = {};
      if (currentSession.imageStorageIds && currentSession.imageStorageIds.length > 0) {
        log.debug('Loading images from IndexedDB');
        imageMapping = await loadImageMapping(currentSession.imageStorageIds);
      } else if (
        currentSession.imageMapping &&
        Object.keys(currentSession.imageMapping).length > 0
      ) {
        log.debug('Using imageMapping from session (old format)');
        imageMapping = currentSession.imageMapping;
      }

      // Create stage client-side
      const stageId = nanoid(10);
      const stage: Stage = {
        id: stageId,
        name: extractTopicFromRequirement(currentSession.requirements.requirement),
        description: '',
        language: currentSession.requirements.language || 'zh-CN',
        style: 'professional',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        sessionDate: Date.now(), // Set session date for classroom organization
        classroomId: currentSession.classroomId, // Assign to classroom if specified
        // Preserve source file metadata for PPT retention
        sourceFileKey: currentSession.pdfStorageKey,
        sourceFileName: currentSession.pdfFileName,
        sourceFileType: currentSession.pdfFileName?.toLowerCase().endsWith('.pptx') 
          ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
          : currentSession.pdfFileName?.toLowerCase().endsWith('.ppt')
          ? 'application/vnd.ms-powerpoint'
          : undefined,
        generationMode: currentSession.requirements.generationMode,
      };

      const settings = useSettingsStore.getState();

      if (isFromSlidesMode && (!pptDerivedOutlines || pptDerivedOutlines.length === 0)) {
        log.warn('No slides extracted from any PPT file; falling back to AI outline generation');
      }

      // ── Generate outlines ──
      let outlines = currentSession.sceneOutlines;

      const outlineStepIdx = activeSteps.findIndex((s) => s.id === 'outline');
      setCurrentStepIndex(outlineStepIdx >= 0 ? outlineStepIdx : 0);
      if (!outlines || outlines.length === 0) {
        if (pptDerivedOutlines && pptDerivedOutlines.length > 0) {
          // from-slides mode: use PPT-derived outlines, skip AI outline generation
          log.debug('Using PPT-derived outlines (no AI outline generation)');
          outlines = pptDerivedOutlines;
          setStreamingOutlines(outlines);
          const updatedSessionPpt = { ...currentSession, sceneOutlines: outlines };
          setSession(updatedSessionPpt);
          sessionStorage.setItem('generationSession', JSON.stringify(updatedSessionPpt));
          currentSession = updatedSessionPpt;
          await new Promise((resolve) => setTimeout(resolve, 400));
        } else {
        log.debug('=== Generating outlines (SSE) ===');
        setStreamingOutlines([]);

        outlines = await new Promise<SceneOutline[]>((resolve, reject) => {
          const collected: SceneOutline[] = [];

          fetch('/api/generate/scene-outlines-stream', {
            method: 'POST',
            headers: getApiHeaders(),
            body: JSON.stringify({
              requirements: currentSession.requirements,
              pdfText: currentSession.pdfText,
              pdfImages: currentSession.pdfImages,
              imageMapping,
              researchContext: currentSession.researchContext,
            }),
            signal,
          })
            .then((res) => {
              if (!res.ok) {
                return res.json().then((d) => {
                  reject(new Error(d.error || t('generation.outlineGenerateFailed')));
                });
              }

              const reader = res.body?.getReader();
              if (!reader) {
                reject(new Error(t('generation.streamNotReadable')));
                return;
              }

              const decoder = new TextDecoder();
              let sseBuffer = '';

              const pump = (): Promise<void> =>
                reader.read().then(({ done, value }) => {
                  if (value) {
                    sseBuffer += decoder.decode(value, { stream: !done });
                    const lines = sseBuffer.split('\n');
                    sseBuffer = lines.pop() || '';

                    for (const line of lines) {
                      if (!line.startsWith('data: ')) continue;
                      try {
                        const evt = JSON.parse(line.slice(6));
                        if (evt.type === 'outline') {
                          collected.push(evt.data);
                          setStreamingOutlines([...collected]);
                        } else if (evt.type === 'retry') {
                          collected.length = 0;
                          setStreamingOutlines([]);
                          setStatusMessage(t('generation.outlineRetrying'));
                        } else if (evt.type === 'done') {
                          resolve(evt.outlines || collected);
                          return;
                        } else if (evt.type === 'error') {
                          reject(new Error(evt.error));
                          return;
                        }
                      } catch (e) {
                        log.error('Failed to parse outline SSE:', line, e);
                      }
                    }
                  }
                  if (done) {
                    if (collected.length > 0) {
                      resolve(collected);
                    } else {
                      reject(new Error(t('generation.outlineEmptyResponse')));
                    }
                    return;
                  }
                  return pump();
                });

              pump().catch(reject);
            })
            .catch(reject);
        });

        const updatedSession = { ...currentSession, sceneOutlines: outlines };
        setSession(updatedSession);
        sessionStorage.setItem('generationSession', JSON.stringify(updatedSession));

        // Outline generation succeeded — clear homepage draft cache
        try {
          localStorage.removeItem('requirementDraft');
        } catch {
          /* ignore */
        }

        // Brief pause to let user see the final outline state
        await new Promise((resolve) => setTimeout(resolve, 800));
        } // end else (SSE path)
      }

      // Move to scene generation step
      setStatusMessage('');
      if (!outlines || outlines.length === 0) {
        throw new Error(t('generation.outlineEmptyResponse'));
      }

      // Store stage and outlines
      const store = useStageStore.getState();
      store.setStage(stage);
      store.setOutlines(outlines);

      // Advance to slide-content step
      const contentStepIdx = activeSteps.findIndex((s) => s.id === 'slide-content');
      if (contentStepIdx >= 0) setCurrentStepIndex(contentStepIdx);

      // Build stageInfo and userProfile for API call
      const stageInfo = {
        name: stage.name,
        description: stage.description,
        language: stage.language,
        style: stage.style,
      };

      const userProfile =
        currentSession.requirements.userNickname || currentSession.requirements.userBio
          ? `Student: ${currentSession.requirements.userNickname || 'Unknown'}${currentSession.requirements.userBio ? ` — ${currentSession.requirements.userBio}` : ''}`
          : undefined;

      // Generate ONLY the first scene
      store.setGeneratingOutlines(outlines);

      const firstOutline = outlines[0];

      // Step 2: Generate content
      // For from-slides mode with a slide scene: build content from PPT text without AI.
      // Quizzes always use AI generation regardless of mode.
      let contentData: { success: boolean; content: unknown; effectiveOutline?: SceneOutline; error?: string };

      if (isFromSlidesMode && firstOutline.type === 'slide') {
        log.debug(`from-slides: building slide content from text for "${firstOutline.title}"`);
        contentData = {
          success: true,
          content: buildSlideContentFromOutline(firstOutline),
          effectiveOutline: firstOutline,
        };
      } else {
        const contentResp = await fetch('/api/generate/scene-content', {
          method: 'POST',
          headers: getApiHeaders(),
          body: JSON.stringify({
            outline: firstOutline,
            allOutlines: outlines,
            pdfImages: currentSession.pdfImages,
            imageMapping,
            stageInfo,
            stageId: stage.id,
          }),
          signal,
        });

        if (!contentResp.ok) {
          const errorData = await contentResp.json().catch(() => ({ error: 'Request failed' }));
          throw new Error(errorData.error || t('generation.sceneGenerateFailed'));
        }

        contentData = await contentResp.json();
        if (!contentData.success || !contentData.content) {
          throw new Error(contentData.error || t('generation.sceneGenerateFailed'));
        }
      }

      // Generate actions (activate actions step indicator)
      const actionsStepIdx = activeSteps.findIndex((s) => s.id === 'actions');
      setCurrentStepIndex(actionsStepIdx >= 0 ? actionsStepIdx : currentStepIndex + 1);

      const actionsResp = await fetch('/api/generate/scene-actions', {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify({
          outline: contentData.effectiveOutline || firstOutline,
          allOutlines: outlines,
          content: contentData.content,
          stageId: stage.id,
          previousSpeeches: [],
          userProfile,
        }),
        signal,
      });

      if (!actionsResp.ok) {
        const errorData = await actionsResp.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(errorData.error || t('generation.sceneGenerateFailed'));
      }

      const data = await actionsResp.json();
      if (!data.success || !data.scene) {
        throw new Error(data.error || t('generation.sceneGenerateFailed'));
      }

      // Generate TTS for first scene using Puter.js (client-side, no API key needed)
      if (settings.ttsEnabled && settings.ttsProviderId === 'puter-tts') {
        const speechActions = (data.scene.actions || []).filter(
          (a: { type: string; text?: string }) => a.type === 'speech' && a.text,
        );
        const providerConfig = settings.ttsProvidersConfig?.['puter-tts'];
        const engine = (providerConfig?.modelId || 'neural') as 'standard' | 'neural' | 'generative';

        for (const action of speechActions) {
          const audioId = `tts_${action.id}`;
          action.audioId = audioId;
          try {
            const { generatePuterTTS } = await import('@/lib/audio/puter-audio-adapter');
            const { audioBuffer, format } = await generatePuterTTS(
              action.text,
              settings.ttsVoice || 'Joanna',
              engine,
            );
            const blob = new Blob([audioBuffer], { type: `audio/${format}` });
            await db.audioFiles.put({ id: audioId, blob, format, createdAt: Date.now() });
          } catch (err) {
            log.warn(`[PuterTTS] Failed for ${audioId}, browser TTS will be used as fallback:`, err);
          }
        }
      }

      // Generate TTS for first scene (part of actions step — blocking)
      if (settings.ttsEnabled && settings.ttsProviderId !== 'browser-native-tts' && settings.ttsProviderId !== 'puter-tts') {
        const ttsProviderConfig = settings.ttsProvidersConfig?.[settings.ttsProviderId];
        const speechActions = (data.scene.actions || []).filter(
          (a: { type: string; text?: string }) => a.type === 'speech' && a.text,
        );

        let ttsFailCount = 0;
        for (const action of speechActions) {
          const audioId = `tts_${action.id}`;
          action.audioId = audioId;
          try {
            const resp = await fetch('/api/generate/tts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text: action.text,
                audioId,
                ttsProviderId: settings.ttsProviderId,
                ttsModelId: ttsProviderConfig?.modelId,
                ttsVoice: settings.ttsVoice,
                ttsSpeed: settings.ttsSpeed,
                ttsApiKey: ttsProviderConfig?.apiKey || undefined,
                ttsBaseUrl: ttsProviderConfig?.baseUrl || undefined,
              }),
              signal,
            });
            if (!resp.ok) {
              ttsFailCount++;
              continue;
            }
            const ttsData = await resp.json();
            if (!ttsData.success) {
              ttsFailCount++;
              continue;
            }
            const binary = atob(ttsData.base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const blob = new Blob([bytes], { type: `audio/${ttsData.format}` });
            await db.audioFiles.put({
              id: audioId,
              blob,
              format: ttsData.format,
              createdAt: Date.now(),
            });
          } catch (err) {
            log.warn(`[TTS] Failed for ${audioId}:`, err);
            ttsFailCount++;
          }
        }

        if (ttsFailCount > 0 && speechActions.length > 0) {
          throw new Error(t('generation.speechFailed'));
        }
      }

      // Add scene to store and navigate
      store.addScene(data.scene);
      store.setCurrentSceneId(data.scene.id);

      // Set remaining outlines as skeleton placeholders
      const remaining = outlines.filter((o) => o.order !== data.scene.order);
      store.setGeneratingOutlines(remaining);

      // Store generation params for classroom to continue generation
      sessionStorage.setItem(
        'generationParams',
        JSON.stringify({
          pdfImages: currentSession.pdfImages,
          userProfile,
        }),
      );

      sessionStorage.removeItem('generationSession');
      await store.saveToStorage();
      router.push(`/classroom/${stage.id}`);
    } catch (err) {
      // AbortError is expected when navigating away — don't show as error
      if (err instanceof DOMException && err.name === 'AbortError') {
        log.info('[GenerationPreview] Generation aborted');
        return;
      }
      sessionStorage.removeItem('generationSession');
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const extractTopicFromRequirement = (requirement: string): string => {
    const trimmed = requirement.trim();
    if (trimmed.length <= 500) {
      return trimmed;
    }
    return trimmed.substring(0, 500).trim() + '...';
  };

  const goBackToHome = () => {
    abortControllerRef.current?.abort();
    sessionStorage.removeItem('generationSession');
    router.push('/');
  };

  // Still loading session from sessionStorage
  if (!sessionLoaded) {
    return (
      <div className="min-h-[100dvh] w-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4">
        <div className="text-center text-muted-foreground">
          <div className="size-8 border-2 border-current border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  // No session found
  if (!session) {
    return (
      <div className="min-h-[100dvh] w-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4">
        <Card className="p-8 max-w-md w-full">
          <div className="text-center space-y-4">
            <AlertCircle className="size-12 text-muted-foreground mx-auto" />
            <h2 className="text-xl font-semibold">{t('generation.sessionNotFound')}</h2>
            <p className="text-sm text-muted-foreground">{t('generation.sessionNotFoundDesc')}</p>
            <Button onClick={() => router.push('/')} className="w-full">
              <ArrowLeft className="size-4 mr-2" />
              {t('generation.backToHome')}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const activeStep =
    activeSteps.length > 0
      ? activeSteps[Math.min(currentStepIndex, activeSteps.length - 1)]
      : ALL_STEPS[0];

  return (
    <div className="min-h-[100dvh] w-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex flex-col items-center justify-center p-4 relative overflow-hidden text-center">
      {/* Background Decor */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div
          className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse"
          style={{ animationDuration: '4s' }}
        />
        <div
          className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse"
          style={{ animationDuration: '6s' }}
        />
      </div>

      {/* Back button */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute top-4 left-4 z-20"
      >
        <Button variant="ghost" size="sm" onClick={goBackToHome}>
          <ArrowLeft className="size-4 mr-2" />
          {t('generation.backToHome')}
        </Button>
      </motion.div>

      <div className="z-10 w-full max-w-lg space-y-8 flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full"
        >
          <Card className="relative overflow-hidden border-muted/40 shadow-2xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl min-h-[400px] flex flex-col items-center justify-center p-8 md:p-12">
            {/* Progress Dots */}
            <div className="absolute top-6 left-0 right-0 flex justify-center gap-2">
              {activeSteps.map((step, idx) => (
                <div
                  key={step.id}
                  className={cn(
                    'h-1.5 rounded-full transition-all duration-500',
                    idx < currentStepIndex
                      ? 'w-1.5 bg-blue-500/30'
                      : idx === currentStepIndex
                        ? 'w-8 bg-blue-500'
                        : 'w-1.5 bg-muted/50',
                  )}
                />
              ))}
            </div>

            {/* Central Content */}
            <div className="flex-1 flex flex-col items-center justify-center w-full space-y-8 mt-4">
              {/* Icon / Visualizer Container */}
              <div className="relative size-48 flex items-center justify-center">
                <AnimatePresence mode="popLayout">
                  {error ? (
                    <motion.div
                      key="error"
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="size-32 rounded-full bg-red-500/10 flex items-center justify-center border-2 border-red-500/20"
                    >
                      <AlertCircle className="size-16 text-red-500" />
                    </motion.div>
                  ) : isComplete ? (
                    <motion.div
                      key="complete"
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="size-32 rounded-full bg-green-500/10 flex items-center justify-center border-2 border-green-500/20"
                    >
                      <CheckCircle2 className="size-16 text-green-500" />
                    </motion.div>
                  ) : (
                    <motion.div
                      key={activeStep.id}
                      initial={{ scale: 0.8, opacity: 0, filter: 'blur(10px)' }}
                      animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
                      exit={{ scale: 1.2, opacity: 0, filter: 'blur(10px)' }}
                      transition={{ duration: 0.4 }}
                      className="absolute inset-0 flex items-center justify-center"
                    >
                      <StepVisualizer
                        stepId={activeStep.id}
                        outlines={streamingOutlines}
                        webSearchSources={webSearchSources}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Text Content */}
              <div className="space-y-3 max-w-sm mx-auto">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={error ? 'error' : isComplete ? 'done' : activeStep.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-2"
                  >
                    <h2 className="text-2xl font-bold tracking-tight">
                      {error
                        ? t('generation.generationFailed')
                        : isComplete
                          ? t('generation.generationComplete')
                          : t(activeStep.title)}
                    </h2>
                    <p className="text-muted-foreground text-base">
                      {error
                        ? error
                        : isComplete
                          ? t('generation.classroomReady')
                          : statusMessage || t(activeStep.description)}
                    </p>
                  </motion.div>
                </AnimatePresence>

                {/* Truncation warning indicator */}
                <AnimatePresence>
                  {truncationWarnings.length > 0 && !error && !isComplete && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0 }}
                      transition={{
                        type: 'spring',
                        stiffness: 500,
                        damping: 30,
                      }}
                      className="flex justify-center"
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <motion.button
                            type="button"
                            animate={{
                              boxShadow: [
                                '0 0 0 0 rgba(251, 191, 36, 0), 0 0 0 0 rgba(251, 191, 36, 0)',
                                '0 0 16px 4px rgba(251, 191, 36, 0.12), 0 0 4px 1px rgba(251, 191, 36, 0.08)',
                                '0 0 0 0 rgba(251, 191, 36, 0), 0 0 0 0 rgba(251, 191, 36, 0)',
                              ],
                            }}
                            transition={{
                              duration: 3,
                              repeat: Infinity,
                              ease: 'easeInOut',
                            }}
                            className="relative size-7 rounded-full flex items-center justify-center cursor-default
                                       bg-gradient-to-br from-amber-400/15 to-orange-400/10
                                       border border-amber-400/25 hover:border-amber-400/40
                                       hover:from-amber-400/20 hover:to-orange-400/15
                                       transition-colors duration-300
                                       focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30"
                          >
                            <AlertTriangle
                              className="size-3.5 text-amber-500 dark:text-amber-400"
                              strokeWidth={2.5}
                            />
                          </motion.button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" sideOffset={6}>
                          <div className="space-y-1 py-0.5">
                            {truncationWarnings.map((w, i) => (
                              <p key={i} className="text-xs leading-relaxed">
                                {w}
                              </p>
                            ))}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Footer Action */}
        <div className="h-16 flex items-center justify-center w-full">
          <AnimatePresence>
            {error ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-xs"
              >
                <Button size="lg" variant="outline" className="w-full h-12" onClick={goBackToHome}>
                  {t('generation.goBackAndRetry')}
                </Button>
              </motion.div>
            ) : !isComplete ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-3 text-sm text-muted-foreground/50 font-medium uppercase tracking-widest"
              >
                <Sparkles className="size-3 animate-pulse" />
                {t('generation.aiWorking')}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

    </div>
  );
}

export default function GenerationPreviewPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[100dvh] w-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center">
          <div className="animate-pulse space-y-4 text-center">
            <div className="h-8 w-48 bg-muted rounded mx-auto" />
            <div className="h-4 w-64 bg-muted rounded mx-auto" />
          </div>
        </div>
      }
    >
      <GenerationPreviewContent />
    </Suspense>
  );
}
