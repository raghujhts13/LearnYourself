'use client';

import { useState, useEffect } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/hooks/use-i18n';
import { nanoid } from 'nanoid';
import { storePdfBlob } from '@/lib/utils/image-storage';
import { useSettingsStore } from '@/lib/store/settings';
import { useUserProfileStore } from '@/lib/store/user-profile';
import type { UserRequirements } from '@/lib/types/generation';
import { GenerationToolbar } from '@/components/generation/generation-toolbar';
import { SettingsDialog } from '@/components/settings';

const WEB_SEARCH_STORAGE_KEY = 'webSearchEnabled';
const LANGUAGE_STORAGE_KEY = 'generationLanguage';

interface CreateClassDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classroomId?: string; // If provided, auto-assign to this classroom
  classrooms?: Array<{ id: string; name: string }>; // Available classrooms for selection
  onCreateClassroom?: () => void; // Callback to open classroom creation dialog
}

export function CreateClassDialog({ 
  open, 
  onOpenChange, 
  classroomId: initialClassroomId,
  classrooms = [],
  onCreateClassroom,
}: CreateClassDialogProps) {
  const { t } = useI18n();
  const router = useRouter();

  const [requirement, setRequirement] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [includeQuizzes, setIncludeQuizzes] = useState(false);
  const [generationMode, setGenerationMode] = useState<'ai' | 'from-slides'>('ai');
  const [language, setLanguage] = useState<'zh-CN' | 'en-US'>('en-US');
  const [webSearch, setWebSearch] = useState(false);
  const [selectedClassroomId, setSelectedClassroomId] = useState<string | undefined>(initialClassroomId);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<
    import('@/lib/types/settings').SettingsSection | undefined
  >(undefined);

  const currentModelId = useSettingsStore((s) => s.modelId);

  // Hydrate persisted preferences
  useEffect(() => {
    try {
      const savedLang = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (savedLang === 'en-US' || savedLang === 'zh-CN') setLanguage(savedLang);
      const savedWS = localStorage.getItem(WEB_SEARCH_STORAGE_KEY);
      if (savedWS === 'true') setWebSearch(true);
    } catch { /* ignore */ }
  }, []);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      setRequirement('');
      setPdfFile(null);
      setIncludeQuizzes(false);
      setGenerationMode('ai');
      setError(null);
      setSelectedClassroomId(initialClassroomId);
    }
  }, [open, initialClassroomId]);

  const handleWebSearchChange = (v: boolean) => {
    setWebSearch(v);
    try { localStorage.setItem(WEB_SEARCH_STORAGE_KEY, String(v)); } catch { /* ignore */ }
  };

  const handleLanguageChange = (lang: 'zh-CN' | 'en-US') => {
    setLanguage(lang);
    try { localStorage.setItem(LANGUAGE_STORAGE_KEY, lang); } catch { /* ignore */ }
  };

  const handleSubmit = async () => {
    if (!currentModelId) {
      setSettingsSection('providers');
      setSettingsOpen(true);
      return;
    }

    if (!requirement.trim()) {
      setError(t('upload.requirementRequired'));
      return;
    }

    // Validate PPT/PPTX when "Use My Slides" mode is selected
    if (generationMode === 'from-slides' && pdfFile) {
      const ext = pdfFile.name.toLowerCase().split('.').pop();
      const isPptx =
        pdfFile.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
        pdfFile.type === 'application/vnd.ms-powerpoint' ||
        ext === 'ppt' ||
        ext === 'pptx';

      if (!isPptx) {
        setError(t('upload.noPresentationFile'));
        return;
      }
    }

    setError(null);

    try {
      const userProfile = useUserProfileStore.getState();
      const requirements: UserRequirements = {
        requirement,
        language,
        userNickname: userProfile.nickname || undefined,
        userBio: userProfile.bio || undefined,
        webSearch,
        includeQuizzes,
        generationMode,
      };

      let pdfStorageKey: string | undefined;
      let pdfFileName: string | undefined;
      let pdfProviderId: string | undefined;
      let pdfProviderConfig: { apiKey?: string; baseUrl?: string } | undefined;

      if (pdfFile) {
        pdfStorageKey = await storePdfBlob(pdfFile);
        pdfFileName = pdfFile.name;

        const settings = useSettingsStore.getState();
        pdfProviderId = settings.pdfProviderId;
        const providerCfg = settings.pdfProvidersConfig?.[settings.pdfProviderId];
        if (providerCfg) {
          pdfProviderConfig = {
            apiKey: providerCfg.apiKey,
            baseUrl: providerCfg.baseUrl,
          };
        }
      }

      const sessionState = {
        sessionId: nanoid(),
        requirements,
        pdfText: '',
        pdfImages: [],
        imageStorageIds: [],
        pdfStorageKey,
        pdfFileName,
        pdfProviderId,
        pdfProviderConfig,
        sceneOutlines: null,
        currentStep: 'generating' as const,
        classroomId: selectedClassroomId,
      };
      sessionStorage.setItem('generationSession', JSON.stringify(sessionState));

      onOpenChange(false);
      router.push('/generation-preview');
    } catch (err) {
      console.error('Error preparing generation:', err);
      setError(err instanceof Error ? err.message : t('upload.generateFailed'));
    }
  };

  if (!open) return null;

  const isPptRequired = generationMode === 'from-slides';
  const hasPptFile =
    pdfFile &&
    (pdfFile.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
      pdfFile.type === 'application/vnd.ms-powerpoint' ||
      pdfFile.name.toLowerCase().endsWith('.ppt') ||
      pdfFile.name.toLowerCase().endsWith('.pptx'));

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="relative w-full max-w-2xl bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between z-10">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              {t('classroom.createClass')}
            </h2>
            <button
              onClick={() => onOpenChange(false)}
              className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Class topic/requirement */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('classroom.classTopicLabel')}
              </label>
              <textarea
                value={requirement}
                onChange={(e) => setRequirement(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder={t('upload.requirementPlaceholder')}
                rows={4}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500 dark:focus:ring-violet-400 resize-none"
                autoFocus
              />
            </div>

            {/* Classroom selection (only show if no classroomId provided) */}
            {!initialClassroomId && classrooms.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('classroom.selectClassroom')}
                </label>
                <div className="flex gap-2">
                  <select
                    value={selectedClassroomId || ''}
                    onChange={(e) => setSelectedClassroomId(e.target.value || undefined)}
                    className="flex-1 px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 dark:focus:ring-violet-400"
                  >
                    <option value="">{t('classroom.noClassroomSelected')}</option>
                    {classrooms.map((classroom) => (
                      <option key={classroom.id} value={classroom.id}>
                        {classroom.name}
                      </option>
                    ))}
                  </select>
                  {onCreateClassroom && (
                    <button
                      type="button"
                      onClick={onCreateClassroom}
                      className="px-4 py-3 rounded-lg border border-violet-600 text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors whitespace-nowrap"
                    >
                      + {t('classroom.createNew')}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Generation toolbar — model, PDF parser, web search, quiz, generation mode, media */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                {t('classroom.generationSettings')}
              </label>
              <div className="p-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50">
                <GenerationToolbar
                  language={language}
                  onLanguageChange={handleLanguageChange}
                  webSearch={webSearch}
                  onWebSearchChange={handleWebSearchChange}
                  onSettingsOpen={(section) => {
                    setSettingsSection(section);
                    setSettingsOpen(true);
                  }}
                  pdfFile={pdfFile}
                  onPdfFileChange={setPdfFile}
                  onPdfError={setError}
                  includeQuizzes={includeQuizzes}
                  onIncludeQuizzesChange={setIncludeQuizzes}
                  generationMode={generationMode}
                  onGenerationModeChange={setGenerationMode}
                />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                {t('classroom.generationSettingsHint')}
              </p>
            </div>

            {/* PPT warning when from-slides but no PPT file */}
            {isPptRequired && pdfFile && !hasPptFile && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 dark:text-amber-200">
                  {t('upload.noPresentationFile')}
                </p>
              </div>
            )}

            {/* Error message */}
            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex gap-3">
            <button
              onClick={() => onOpenChange(false)}
              className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleSubmit}
              disabled={!requirement.trim() || (isPptRequired && !!pdfFile && !hasPptFile)}
              className="flex-1 px-4 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium transition-colors"
            >
              {t('classroom.startGeneration')}
            </button>
          </div>
        </div>
      </div>

      {/* Settings dialog opened from within the toolbar */}
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={(v) => {
          setSettingsOpen(v);
          if (!v) setSettingsSection(undefined);
        }}
        initialSection={settingsSection}
      />
    </>
  );
}
