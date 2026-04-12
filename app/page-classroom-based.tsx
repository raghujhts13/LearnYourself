'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus,
  Settings,
  Sun,
  Moon,
  Monitor,
  Clock,
  ChevronDown,
} from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { LanguageSwitcher } from '@/components/language-switcher';
import { cn } from '@/lib/utils';
import { SettingsDialog } from '@/components/settings';
import { useTheme } from '@/lib/hooks/use-theme';
import { nanoid } from 'nanoid';
import { storePdfBlob } from '@/lib/utils/image-storage';
import type { UserRequirements } from '@/lib/types/generation';
import { useSettingsStore } from '@/lib/store/settings';
import { useUserProfileStore } from '@/lib/store/user-profile';
import {
  listClassrooms,
  getClassroomStages,
  deleteClassroom,
  renameClassroom,
  migrateFoldersToClassrooms,
  type ClassroomRecord,
} from '@/lib/utils/stage-storage';
import { CreateClassroomDialog } from '@/components/home/CreateClassroomDialog';
import { ClassroomCard } from '@/components/home/ClassroomCard';
import { CreateClassDialog } from '@/components/home/CreateClassDialog';
import { toast } from 'sonner';
import { useDraftCache } from '@/lib/hooks/use-draft-cache';
import { SpeechButton } from '@/components/audio/speech-button';

const WEB_SEARCH_STORAGE_KEY = 'webSearchEnabled';
const LANGUAGE_STORAGE_KEY = 'generationLanguage';
const RECENT_OPEN_STORAGE_KEY = 'recentClassroomsOpen';
const MIGRATION_DONE_KEY = 'classroomMigrationDone';

interface FormState {
  pdfFile: File | null;
  requirement: string;
  language: 'zh-CN' | 'en-US';
  webSearch: boolean;
  includeQuizzes: boolean;
  generationMode: 'ai' | 'from-slides';
}

const initialFormState: FormState = {
  pdfFile: null,
  requirement: '',
  language: 'en-US',
  webSearch: false,
  includeQuizzes: false,
  generationMode: 'ai',
};

export default function ClassroomBasedHomePage() {
  const { t } = useI18n();
  const { theme, setTheme } = useTheme();
  const router = useRouter();

  // Form state
  const [form, setForm] = useState<FormState>(initialFormState);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<
    import('@/lib/types/settings').SettingsSection | undefined
  >(undefined);
  const [themeOpen, setThemeOpen] = useState(false);
  const [recentOpen, setRecentOpen] = useState(true);

  // Classroom state
  const [classrooms, setClassrooms] = useState<ClassroomRecord[]>([]);
  const [classCounts, setClassCounts] = useState<Record<string, number>>({});
  const [classroomDates, setClassroomDates] = useState<Record<string, number>>({});
  
  // Dialogs
  const [createClassroomOpen, setCreateClassroomOpen] = useState(false);
  const [createClassOpen, setCreateClassOpen] = useState(false);
  const [selectedClassroomId, setSelectedClassroomId] = useState<string | null>(null);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renamingClassroom, setRenamingClassroom] = useState<ClassroomRecord | null>(null);

  // Refs
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Draft cache
  const { cachedValue: cachedRequirement, updateCache: updateRequirementCache } =
    useDraftCache<string>({ key: 'requirementDraft' });

  // Settings
  const currentModelId = useSettingsStore((s) => s.modelId);

  // Load classrooms
  const loadClassrooms = async () => {
    try {
      const data = await listClassrooms();
      setClassrooms(data);

      // Get class counts and last active dates for each classroom
      const counts: Record<string, number> = {};
      const dates: Record<string, number> = {};
      
      for (const classroom of data) {
        const classes = await getClassroomStages(classroom.id);
        counts[classroom.id] = classes.length;
        
        // Get most recent class date
        if (classes.length > 0) {
          const latestDate = Math.max(
            ...classes.map((c) => c.sessionDate || c.createdAt || 0)
          );
          dates[classroom.id] = latestDate;
        }
      }
      
      setClassCounts(counts);
      setClassroomDates(dates);
    } catch (err) {
      console.error('Failed to load classrooms:', err);
      toast.error('Failed to load classrooms');
    }
  };

  // Run migration on first load
  useEffect(() => {
    const runMigration = async () => {
      try {
        const migrationDone = localStorage.getItem(MIGRATION_DONE_KEY);
        if (!migrationDone) {
          await migrateFoldersToClassrooms();
          localStorage.setItem(MIGRATION_DONE_KEY, 'true');
          toast.success('Migrated folders to classrooms');
        }
      } catch (err) {
        console.error('Migration failed:', err);
      }
      loadClassrooms();
    };
    runMigration();
  }, []);

  // Hydrate localStorage settings
  useEffect(() => {
    try {
      const saved = localStorage.getItem(RECENT_OPEN_STORAGE_KEY);
      if (saved !== null) setRecentOpen(saved !== 'false');
    } catch {
      /* ignore */
    }
    try {
      const savedWebSearch = localStorage.getItem(WEB_SEARCH_STORAGE_KEY);
      const savedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      const updates: Partial<FormState> = {};
      if (savedWebSearch === 'true') updates.webSearch = true;
      if (savedLanguage === 'en-US') updates.language = savedLanguage;
      else updates.language = 'en-US';
      if (Object.keys(updates).length > 0) {
        setForm((prev) => ({ ...prev, ...updates }));
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Restore draft
  const [prevCached, setPrevCached] = useState(cachedRequirement);
  if (cachedRequirement !== prevCached) {
    setPrevCached(cachedRequirement);
    if (cachedRequirement) {
      setForm((prev) => ({ ...prev, requirement: cachedRequirement }));
    }
  }

  const updateForm = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key === 'requirement') {
      updateRequirementCache(value as string);
    }
    if (key === 'webSearch') {
      try {
        localStorage.setItem(WEB_SEARCH_STORAGE_KEY, String(value));
      } catch {
        /* ignore */
      }
    }
    if (key === 'language') {
      try {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, value as string);
      } catch {
        /* ignore */
      }
    }
  };

  const handleDeleteClassroom = async (id: string) => {
    if (!confirm('Delete this classroom? All classes will be unassigned.')) return;
    
    try {
      await deleteClassroom(id);
      toast.success(t('classroom.deleteSuccess'));
      loadClassrooms();
    } catch (err) {
      console.error('Failed to delete classroom:', err);
      toast.error(t('classroom.deleteFailed'));
    }
  };

  const handleRenameClassroom = async (id: string, newName: string) => {
    try {
      await renameClassroom(id, newName);
      toast.success(t('classroom.renameSuccess'));
      loadClassrooms();
    } catch (err) {
      console.error('Failed to rename classroom:', err);
      toast.error(t('classroom.renameFailed'));
    }
  };

  const handleQuickGenerate = async () => {
    if (!currentModelId) {
      setSettingsOpen(true);
      return;
    }

    if (!form.requirement.trim()) {
      setError(t('upload.requirementRequired'));
      return;
    }

    // Validate PPT/PPTX when "Use My Slides" mode is selected
    if (form.generationMode === 'from-slides' && form.pdfFile) {
      const ext = form.pdfFile.name.toLowerCase().split('.').pop();
      const isPptx =
        form.pdfFile.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
        form.pdfFile.type === 'application/vnd.ms-powerpoint' ||
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
        requirement: form.requirement,
        language: form.language,
        userNickname: userProfile.nickname || undefined,
        userBio: userProfile.bio || undefined,
        webSearch: form.webSearch || undefined,
        includeQuizzes: form.includeQuizzes,
        generationMode: form.generationMode,
      };

      let pdfStorageKey: string | undefined;
      let pdfFileName: string | undefined;
      let pdfProviderId: string | undefined;
      let pdfProviderConfig: { apiKey?: string; baseUrl?: string } | undefined;

      if (form.pdfFile) {
        pdfStorageKey = await storePdfBlob(form.pdfFile);
        pdfFileName = form.pdfFile.name;

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
        classroomId: selectedClassroomId || undefined,
      };
      sessionStorage.setItem('generationSession', JSON.stringify(sessionState));

      router.push('/generation-preview');
    } catch (err) {
      console.error('Error preparing generation:', err);
      setError(err instanceof Error ? err.message : t('upload.generateFailed'));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleQuickGenerate();
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return t('classroom.today');
    if (diffDays === 1) return t('classroom.yesterday');
    if (diffDays < 7) return `${diffDays} ${t('classroom.daysAgo')}`;
    return date.toLocaleDateString();
  };

  return (
    <div className="relative min-h-screen flex flex-col bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse"
          style={{ animationDuration: '4s' }}
        />
        <div
          className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse"
          style={{ animationDuration: '6s' }}
        />
      </div>

      {/* Top bar */}
      <div className="relative z-30 flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <img src="/lys-logo.png" alt="LYS" className="h-8" />
        </div>
        
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          
          {/* Theme selector */}
          <div className="relative">
            <button
              onClick={() => setThemeOpen(!themeOpen)}
              className="p-2 rounded-lg hover:bg-muted/50 transition-colors"
            >
              {theme === 'light' && <Sun className="w-4 h-4" />}
              {theme === 'dark' && <Moon className="w-4 h-4" />}
              {theme === 'system' && <Monitor className="w-4 h-4" />}
            </button>
            
            {themeOpen && (
              <div className="absolute right-0 top-12 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-2 min-w-[140px] z-50">
                <button
                  onClick={() => { setTheme('light'); setThemeOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-sm"
                >
                  <Sun className="w-4 h-4" />
                  Light
                </button>
                <button
                  onClick={() => { setTheme('dark'); setThemeOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-sm"
                >
                  <Moon className="w-4 h-4" />
                  Dark
                </button>
                <button
                  onClick={() => { setTheme('system'); setThemeOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-sm"
                >
                  <Monitor className="w-4 h-4" />
                  System
                </button>
              </div>
            )}
          </div>
          
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-2 rounded-lg hover:bg-muted/50 transition-colors"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="relative z-20 flex-1 flex flex-col items-center px-4 pb-8">
        {/* Hero section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className={cn(
            'w-full max-w-5xl flex flex-col items-center',
            classrooms.length === 0 ? 'justify-center min-h-[60vh]' : 'mt-12',
          )}
        >
          {classrooms.length === 0 && (
            <>
              <motion.h1
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
                className="text-4xl md:text-5xl font-bold text-center mb-4 bg-gradient-to-r from-violet-600 to-purple-600 dark:from-violet-400 dark:to-purple-400 bg-clip-text text-transparent"
              >
                {t('classroom.myClassrooms')}
              </motion.h1>
              
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-lg text-muted-foreground text-center mb-8"
              >
                {t('classroom.createFirstClassroom')}
              </motion.p>

              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                onClick={() => setCreateClassroomOpen(true)}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-medium shadow-lg shadow-violet-500/30 transition-all hover:shadow-xl hover:shadow-violet-500/40"
              >
                <Plus className="w-5 h-5" />
                {t('classroom.createClassroom')}
              </motion.button>
            </>
          )}

          {classrooms.length > 0 && (
            <>
              <div className="w-full flex items-center justify-between mb-8">
                <h1 className="text-3xl font-bold">{t('classroom.myClassrooms')}</h1>
                <button
                  onClick={() => setCreateClassroomOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-medium transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  {t('classroom.createClassroom')}
                </button>
              </div>

              <div className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {classrooms.map((classroom, i) => (
                  <motion.div
                    key={classroom.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05, duration: 0.3 }}
                  >
                    <ClassroomCard
                      classroom={classroom}
                      classCount={classCounts[classroom.id] || 0}
                      lastActiveDate={classroomDates[classroom.id]}
                      onDelete={() => handleDeleteClassroom(classroom.id)}
                      onRename={() => {
                        setRenamingClassroom(classroom);
                        setRenameDialogOpen(true);
                      }}
                      onAddClass={() => {
                        setSelectedClassroomId(classroom.id);
                        setCreateClassOpen(true);
                      }}
                      onOpenJournal={() => router.push(`/journal/${classroom.id}`)}
                    />
                  </motion.div>
                ))}
              </div>
            </>
          )}
        </motion.div>
      </div>

      {/* Dialogs */}
      <CreateClassroomDialog
        open={createClassroomOpen}
        onOpenChange={setCreateClassroomOpen}
        onSuccess={loadClassrooms}
      />

      <CreateClassDialog
        open={createClassOpen}
        onOpenChange={setCreateClassOpen}
        classroomId={selectedClassroomId || undefined}
        classrooms={classrooms.map(c => ({ id: c.id, name: c.name }))}
        onCreateClassroom={() => {
          setCreateClassOpen(false);
          setCreateClassroomOpen(true);
        }}
      />

      {renameDialogOpen && renamingClassroom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <h2 className="text-xl font-semibold mb-4">{t('classroom.rename')}</h2>
            <input
              type="text"
              defaultValue={renamingClassroom.name}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white mb-4"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const newName = e.currentTarget.value.trim();
                  if (newName) {
                    handleRenameClassroom(renamingClassroom.id, newName);
                    setRenameDialogOpen(false);
                  }
                }
              }}
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => setRenameDialogOpen(false)}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => {
                  const input = document.querySelector('input[type="text"]') as HTMLInputElement;
                  const newName = input?.value.trim();
                  if (newName) {
                    handleRenameClassroom(renamingClassroom.id, newName);
                    setRenameDialogOpen(false);
                  }
                }}
                className="flex-1 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white"
              >
                {t('common.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        initialSection={settingsSection}
      />
    </div>
  );
}
