'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowUp,
  Check,
  ChevronDown,
  Clock,
  Copy,
  Download,
  ImagePlus,
  Pencil,
  Trash2,
  Settings,
  Sun,
  Moon,
  Monitor,
  BotOff,
  ChevronUp,
  Upload,
  Share2,
  Globe,
  Link,
  Loader2,
  EyeOff,
  FolderPlus,
  FolderOpen,
  Folder,
  X,
} from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { LanguageSwitcher } from '@/components/language-switcher';
import { createLogger } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import { Textarea as UITextarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { SettingsDialog } from '@/components/settings';
import { GenerationToolbar } from '@/components/generation/generation-toolbar';
import { useTheme } from '@/lib/hooks/use-theme';
import { nanoid } from 'nanoid';
import { storePdfBlob } from '@/lib/utils/image-storage';
import type { UserRequirements } from '@/lib/types/generation';
import { useSettingsStore } from '@/lib/store/settings';
import { useUserProfileStore, AVATAR_OPTIONS } from '@/lib/store/user-profile';
import {
  StageListItem,
  listStages,
  deleteStageData,
  renameStage,
  getFirstSlideByStages,
  listFolders,
  createFolder,
  renameFolder,
  deleteFolder,
  moveStageToFolder,
  type FolderRecord,
} from '@/lib/utils/stage-storage';
import { exportSession, importSession } from '@/lib/utils/session-export';
import { publishSession, unpublishSession } from '@/lib/utils/session-publish';
import { ThumbnailSlide } from '@/components/slide-renderer/components/ThumbnailSlide';
import type { Slide } from '@/lib/types/slides';
import { useMediaGenerationStore } from '@/lib/store/media-generation';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDraftCache } from '@/lib/hooks/use-draft-cache';
import { SpeechButton } from '@/components/audio/speech-button';

const log = createLogger('Home');

const WEB_SEARCH_STORAGE_KEY = 'webSearchEnabled';
const LANGUAGE_STORAGE_KEY = 'generationLanguage';
const RECENT_OPEN_STORAGE_KEY = 'recentClassroomsOpen';

interface FormState {
  pdfFile: File | null;
  requirement: string;
  language: 'zh-CN' | 'en-US';
  webSearch: boolean;
}

const initialFormState: FormState = {
  pdfFile: null,
  requirement: '',
  language: 'en-US',
  webSearch: false,
};

function HomePage() {
  const { t } = useI18n();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initialFormState);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<
    import('@/lib/types/settings').SettingsSection | undefined
  >(undefined);

  // Draft cache for requirement text
  const { cachedValue: cachedRequirement, updateCache: updateRequirementCache } =
    useDraftCache<string>({ key: 'requirementDraft' });

  // Model setup state
  const currentModelId = useSettingsStore((s) => s.modelId);
  const [recentOpen, setRecentOpen] = useState(true);

  // Hydrate client-only state after mount (avoids SSR mismatch)
  /* eslint-disable react-hooks/set-state-in-effect -- Hydration from localStorage must happen in effect */
  useEffect(() => {
    try {
      const saved = localStorage.getItem(RECENT_OPEN_STORAGE_KEY);
      if (saved !== null) setRecentOpen(saved !== 'false');
    } catch {
      /* localStorage unavailable */
    }
    try {
      const savedWebSearch = localStorage.getItem(WEB_SEARCH_STORAGE_KEY);
      const savedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      const updates: Partial<FormState> = {};
      if (savedWebSearch === 'true') updates.webSearch = true;
      if (savedLanguage === 'en-US') {
        updates.language = savedLanguage;
      } else {
        updates.language = 'en-US';
      }
      if (Object.keys(updates).length > 0) {
        setForm((prev) => ({ ...prev, ...updates }));
      }
    } catch {
      /* localStorage unavailable */
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Restore requirement draft from cache (derived state pattern — no effect needed)
  const [prevCachedRequirement, setPrevCachedRequirement] = useState(cachedRequirement);
  if (cachedRequirement !== prevCachedRequirement) {
    setPrevCachedRequirement(cachedRequirement);
    if (cachedRequirement) {
      setForm((prev) => ({ ...prev, requirement: cachedRequirement }));
    }
  }

  const [themeOpen, setThemeOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [classrooms, setClassrooms] = useState<StageListItem[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, Slide>>({});
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  // ─── Folder state ────────────────────────────────────────────────────────────
  const [folders, setFolders] = useState<FolderRecord[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [pendingDeleteFolderId, setPendingDeleteFolderId] = useState<string | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    if (!themeOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setThemeOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [themeOpen]);

  const loadClassrooms = async () => {
    try {
      const [list, folderList] = await Promise.all([listStages(), listFolders()]);
      setClassrooms(list);
      setFolders(folderList);
      // Load first slide thumbnails
      if (list.length > 0) {
        const slides = await getFirstSlideByStages(list.map((c) => c.id));
        setThumbnails(slides);
      }
    } catch (err) {
      log.error('Failed to load classrooms:', err);
    }
  };

  useEffect(() => {
    // Clear stale media store to prevent cross-course thumbnail contamination.
    // The store may hold tasks from a previously visited classroom whose elementIds
    // (gen_img_1, etc.) collide with other courses' placeholders.
    useMediaGenerationStore.getState().revokeObjectUrls();
    useMediaGenerationStore.setState({ tasks: {} });

    // eslint-disable-next-line react-hooks/set-state-in-effect -- Store hydration on mount
    loadClassrooms();
  }, []);

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPendingDeleteId(id);
  };

  const confirmDelete = async (id: string) => {
    setPendingDeleteId(null);
    try {
      await deleteStageData(id);
      await loadClassrooms();
    } catch (err) {
      log.error('Failed to delete classroom:', err);
      toast.error('Failed to delete classroom');
    }
  };

  const handleRename = async (id: string, newName: string) => {
    try {
      await renameStage(id, newName);
      setClassrooms((prev) => prev.map((c) => (c.id === id ? { ...c, name: newName } : c)));
    } catch (err) {
      log.error('Failed to rename classroom:', err);
      toast.error(t('classroom.renameFailed'));
    }
  };

  // ─── Folder handlers ──────────────────────────────────────────────────────────
  const handleCreateFolder = async () => {
    try {
      const id = await createFolder('New Folder');
      await loadClassrooms();
      setEditingFolderId(id);
    } catch (err) {
      log.error('Failed to create folder:', err);
      toast.error('Failed to create folder');
    }
  };

  const handleRenameFolder = async (id: string, newName: string) => {
    try {
      await renameFolder(id, newName);
      setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name: newName } : f)));
    } catch (err) {
      log.error('Failed to rename folder:', err);
      toast.error('Failed to rename folder');
    }
  };

  const handleDeleteFolder = async (id: string) => {
    try {
      await deleteFolder(id);
      if (activeFolderId === id) setActiveFolderId(null);
      await loadClassrooms();
    } catch (err) {
      log.error('Failed to delete folder:', err);
      toast.error('Failed to delete folder');
    } finally {
      setPendingDeleteFolderId(null);
    }
  };

  const handleMoveToFolder = async (stageId: string, folderId: string | null) => {
    try {
      await moveStageToFolder(stageId, folderId);
      setClassrooms((prev) =>
        prev.map((c) => (c.id === stageId ? { ...c, folderId: folderId ?? undefined } : c)),
      );
    } catch (err) {
      log.error('Failed to move classroom to folder:', err);
      toast.error('Failed to move classroom');
    }
  };

  const handleExport = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await exportSession(id);
      toast.success(t('classroom.exportSuccess'));
    } catch (err) {
      log.error('Failed to export session:', err);
      toast.error(t('classroom.exportFailed'));
    }
  };

  // ─── Share / Publish state ─────────────────────────────────────────────────
  const [shareDialogId, setShareDialogId] = useState<string | null>(null);
  const [shareIncludeMedia, setShareIncludeMedia] = useState(true);
  const [shareTarget, setShareTarget] = useState<'local' | 'vercel' | 'custom'>('local');
  const [sharePublishing, setSharePublishing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareCopiedStudent, setShareCopiedStudent] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  // Server URL info (fetched when dialog opens)
  const [shareServerInfo, setShareServerInfo] = useState<{
    url: string;
    isLocal: boolean;
    isTunneled: boolean;
    provider: string;
    vercelDeployConfigured?: boolean;
  } | null>(null);
  const [shareServerLoading, setShareServerLoading] = useState(false);
  // Manual URL override by the teacher
  const [shareManualUrl, setShareManualUrl] = useState('');
  const [shareShowManualUrl, setShareShowManualUrl] = useState(false);

  const openShareDialog = (id: string, existingUrl?: string) => {
    setShareDialogId(id);
    setShareUrl(existingUrl || null);
    setShareError(null);
    setShareCopied(false);
    setShareTarget(
      existingUrl?.includes('.vercel.app') && existingUrl.includes('/learn/')
        ? 'vercel'
        : 'local',
    );
    setShareServerInfo(null);
    setShareManualUrl('');
    setShareShowManualUrl(false);
    // Fetch server URL info asynchronously
    setShareServerLoading(true);
    fetch('/api/public-url')
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setShareServerInfo({
            url: data.url,
            isLocal: data.isLocal,
            isTunneled: data.isTunneled,
            provider: data.provider,
            vercelDeployConfigured: data.vercelDeployConfigured,
          });
          // Pre-fill manual override with current server URL so teacher can edit it
          setShareManualUrl(data.url);
        }
      })
      .catch(() => {/* non-fatal */})
      .finally(() => setShareServerLoading(false));
  };

  const closeShareDialog = () => {
    setShareDialogId(null);
    setShareUrl(null);
    setShareError(null);
    setShareServerInfo(null);
    setShareShowManualUrl(false);
  };

  const handlePublish = async () => {
    if (!shareDialogId) return;
    setSharePublishing(true);
    setShareError(null);
    try {
      if (shareTarget === 'custom' && !shareManualUrl.trim()) {
        setShareError('Enter your public base URL (e.g. https://your-server.com)');
        return;
      }
      if (shareTarget === 'vercel' && !shareServerInfo?.vercelDeployConfigured) {
        setShareError(
          'Add VERCEL_TOKEN to .env.local on this OpenMAIC server, restart, then try again.',
        );
        return;
      }

      const baseUrlOverride =
        shareTarget === 'custom'
          ? shareManualUrl.trim()
          : shareTarget === 'local' && shareShowManualUrl && shareManualUrl.trim()
            ? shareManualUrl.trim()
            : undefined;

      const result = await publishSession(shareDialogId, {
        includeMedia: shareIncludeMedia,
        baseUrlOverride,
        shareTarget,
      });
      setShareUrl(result.url);
      await loadClassrooms();
      toast.success(
        shareTarget === 'vercel' ? 'Deployed to Vercel — share the student link below' : 'Classroom published successfully',
      );
    } catch (err) {
      log.error('Failed to publish:', err);
      setShareError(err instanceof Error ? err.message : 'Publish failed');
    } finally {
      setSharePublishing(false);
    }
  };

  const publishDisabled =
    sharePublishing ||
    (shareTarget === 'vercel' && (shareServerLoading || !shareServerInfo?.vercelDeployConfigured));

  const studentShareUrl = shareUrl
    ? shareUrl.includes('/learn/')
      ? shareUrl
      : shareUrl.replace('/classroom/', '/learn/')
    : null;
  const professorShareUrl = shareUrl && !shareUrl.includes('/learn/') ? shareUrl : null;

  const handleUnpublish = async () => {
    if (!shareDialogId) return;
    setSharePublishing(true);
    setShareError(null);
    try {
      await unpublishSession(shareDialogId);
      setShareUrl(null);
      await loadClassrooms();
      toast.success('Classroom unpublished');
    } catch (err) {
      log.error('Failed to unpublish:', err);
      setShareError(err instanceof Error ? err.message : 'Unpublish failed');
    } finally {
      setSharePublishing(false);
    }
  };

  const handleCopyProfessorUrl = () => {
    if (!professorShareUrl) return;
    navigator.clipboard.writeText(professorShareUrl).then(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    });
  };

  const handleCopyStudentUrl = () => {
    if (!studentShareUrl) return;
    navigator.clipboard.writeText(studentShareUrl).then(() => {
      setShareCopiedStudent(true);
      setTimeout(() => setShareCopiedStudent(false), 2000);
    });
  };

  const importInputRef = useRef<HTMLInputElement>(null);

  const handleImportClick = () => {
    importInputRef.current?.click();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      const stageId = await importSession(file);
      await loadClassrooms();
      toast.success(t('classroom.importSuccess'));
      router.push(`/classroom/${stageId}`);
    } catch (err) {
      log.error('Failed to import session:', err);
      toast.error(t('classroom.importFailed'));
    }
  };

  const updateForm = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    try {
      if (field === 'webSearch') localStorage.setItem(WEB_SEARCH_STORAGE_KEY, String(value));
      if (field === 'language') localStorage.setItem(LANGUAGE_STORAGE_KEY, String(value));
      if (field === 'requirement') updateRequirementCache(value as string);
    } catch {
      /* ignore */
    }
  };

  const showSetupToast = (icon: React.ReactNode, title: string, desc: string) => {
    toast.custom(
      (id) => (
        <div
          className="w-[356px] rounded-xl border border-amber-200/60 dark:border-amber-800/40 bg-gradient-to-r from-amber-50 via-white to-amber-50 dark:from-amber-950/60 dark:via-slate-900 dark:to-amber-950/60 shadow-lg shadow-amber-500/8 dark:shadow-amber-900/20 p-4 flex items-start gap-3 cursor-pointer"
          onClick={() => {
            toast.dismiss(id);
            setSettingsOpen(true);
          }}
        >
          <div className="shrink-0 mt-0.5 size-9 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center ring-1 ring-amber-200/50 dark:ring-amber-800/30">
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200 leading-tight">
              {title}
            </p>
            <p className="text-xs text-amber-700/80 dark:text-amber-400/70 mt-0.5 leading-relaxed">
              {desc}
            </p>
          </div>
          <div className="shrink-0 mt-1 text-[10px] font-medium text-amber-500 dark:text-amber-500/70 tracking-wide">
            <Settings className="size-3.5 animate-[spin_3s_linear_infinite]" />
          </div>
        </div>
      ),
      { duration: 4000 },
    );
  };

  const handleGenerate = async () => {
    // Validate setup before proceeding
    if (!currentModelId) {
      showSetupToast(
        <BotOff className="size-4.5 text-amber-600 dark:text-amber-400" />,
        t('settings.modelNotConfigured'),
        t('settings.setupNeeded'),
      );
      setSettingsOpen(true);
      return;
    }

    if (!form.requirement.trim()) {
      setError(t('upload.requirementRequired'));
      return;
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
      };
      sessionStorage.setItem('generationSession', JSON.stringify(sessionState));

      router.push('/generation-preview');
    } catch (err) {
      log.error('Error preparing generation:', err);
      setError(err instanceof Error ? err.message : t('upload.generateFailed'));
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

  const canGenerate = !!form.requirement.trim();

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (canGenerate) handleGenerate();
    }
  };

  return (
    <div className="min-h-[100dvh] w-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex flex-col items-center p-4 pt-16 md:p-8 md:pt-16 overflow-x-hidden">
      {/* ═══ Top-right pill (unchanged) ═══ */}
      <div
        ref={toolbarRef}
        className="fixed top-4 right-4 z-50 flex items-center gap-1 bg-white/60 dark:bg-gray-800/60 backdrop-blur-md px-2 py-1.5 rounded-full border border-gray-100/50 dark:border-gray-700/50 shadow-sm"
      >
        {/* Language Selector */}
        <LanguageSwitcher onOpen={() => setThemeOpen(false)} />

        <div className="w-[1px] h-4 bg-gray-200 dark:bg-gray-700" />

        {/* Theme Selector */}
        <div className="relative">
          <button
            onClick={() => {
              setThemeOpen(!themeOpen);
            }}
            className="p-2 rounded-full text-gray-400 dark:text-gray-500 hover:bg-white dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200 hover:shadow-sm transition-all"
          >
            {theme === 'light' && <Sun className="w-4 h-4" />}
            {theme === 'dark' && <Moon className="w-4 h-4" />}
            {theme === 'system' && <Monitor className="w-4 h-4" />}
          </button>
          {themeOpen && (
            <div className="absolute top-full mt-2 right-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden z-50 min-w-[140px]">
              <button
                onClick={() => {
                  setTheme('light');
                  setThemeOpen(false);
                }}
                className={cn(
                  'w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2',
                  theme === 'light' &&
                    'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
                )}
              >
                <Sun className="w-4 h-4" />
                {t('settings.themeOptions.light')}
              </button>
              <button
                onClick={() => {
                  setTheme('dark');
                  setThemeOpen(false);
                }}
                className={cn(
                  'w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2',
                  theme === 'dark' &&
                    'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
                )}
              >
                <Moon className="w-4 h-4" />
                {t('settings.themeOptions.dark')}
              </button>
              <button
                onClick={() => {
                  setTheme('system');
                  setThemeOpen(false);
                }}
                className={cn(
                  'w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2',
                  theme === 'system' &&
                    'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
                )}
              >
                <Monitor className="w-4 h-4" />
                {t('settings.themeOptions.system')}
              </button>
            </div>
          )}
        </div>

        <div className="w-[1px] h-4 bg-gray-200 dark:bg-gray-700" />

        {/* Settings Button */}
        <div className="relative">
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-2 rounded-full text-gray-400 dark:text-gray-500 hover:bg-white dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200 hover:shadow-sm transition-all group"
          >
            <Settings className="w-4 h-4 group-hover:rotate-90 transition-transform duration-500" />
          </button>
        </div>
      </div>
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={(open) => {
          setSettingsOpen(open);
          if (!open) setSettingsSection(undefined);
        }}
        initialSection={settingsSection}
      />

      {/* ═══ Background Decor ═══ */}
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

      {/* ═══ Hero section: title + input (centered, wider) ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className={cn(
          'relative z-20 w-full max-w-[800px] flex flex-col items-center',
          classrooms.length === 0 ? 'justify-center min-h-[calc(100dvh-8rem)]' : 'mt-[10vh]',
        )}
      >
        {/* ── Logo ── */}
        <motion.img
          src="/lys-logo.png"
          alt="LYS Curated E-Learning"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{
            delay: 0.1,
            type: 'spring',
            stiffness: 200,
            damping: 20,
          }}
          className="h-20 md:h-24 mb-2"
        />

        {/* ── Slogan ── */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="text-sm text-muted-foreground/60 mb-8"
        >
          {t('home.slogan')}
        </motion.p>

        {/* ── Unified input area ── */}
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.35 }}
          className="w-full"
        >
          <div className="w-full rounded-2xl border border-border/60 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-xl shadow-black/[0.03] dark:shadow-black/20 transition-shadow focus-within:shadow-2xl focus-within:shadow-violet-500/[0.06]">
            {/* ── Greeting + Profile + Agents ── */}
            <div className="relative z-20 flex items-start justify-between">
              <GreetingBar />
            </div>

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              placeholder={t('upload.requirementPlaceholder')}
              className="w-full resize-none border-0 bg-transparent px-4 pt-1 pb-2 text-[13px] leading-relaxed placeholder:text-muted-foreground/40 focus:outline-none min-h-[140px] max-h-[300px]"
              value={form.requirement}
              onChange={(e) => updateForm('requirement', e.target.value)}
              onKeyDown={handleKeyDown}
              rows={4}
            />

            {/* Toolbar row */}
            <div className="px-3 pb-3 flex items-end gap-2">
              <div className="flex-1 min-w-0">
                <GenerationToolbar
                  language={form.language}
                  onLanguageChange={(lang) => updateForm('language', lang)}
                  webSearch={form.webSearch}
                  onWebSearchChange={(v) => updateForm('webSearch', v)}
                  onSettingsOpen={(section) => {
                    setSettingsSection(section);
                    setSettingsOpen(true);
                  }}
                  pdfFile={form.pdfFile}
                  onPdfFileChange={(f) => updateForm('pdfFile', f)}
                  onPdfError={setError}
                />
              </div>

              {/* Voice input */}
              <SpeechButton
                size="md"
                onTranscription={(text) => {
                  setForm((prev) => {
                    const next = prev.requirement + (prev.requirement ? ' ' : '') + text;
                    updateRequirementCache(next);
                    return { ...prev, requirement: next };
                  });
                }}
              />

              {/* Send button */}
              <button
                onClick={handleGenerate}
                disabled={!canGenerate}
                className={cn(
                  'shrink-0 h-8 rounded-lg flex items-center justify-center gap-1.5 transition-all px-3',
                  canGenerate
                    ? 'bg-primary text-primary-foreground hover:opacity-90 shadow-sm cursor-pointer'
                    : 'bg-muted text-muted-foreground/40 cursor-not-allowed',
                )}
              >
                <span className="text-xs font-medium">{t('toolbar.enterClassroom')}</span>
                <ArrowUp className="size-3.5" />
              </button>
            </div>
          </div>
        </motion.div>

        {/* ── Error ── */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 w-full p-3 bg-destructive/10 border border-destructive/20 rounded-lg"
            >
              <p className="text-sm text-destructive">{error}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ═══ Recent classrooms — collapsible ═══ */}
      {classrooms.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="relative z-10 mt-10 w-full max-w-6xl flex flex-col items-center"
        >
          {/* Trigger — divider-line with centered text */}
          <button
            onClick={() => {
              const next = !recentOpen;
              setRecentOpen(next);
              try {
                localStorage.setItem(RECENT_OPEN_STORAGE_KEY, String(next));
              } catch {
                /* ignore */
              }
            }}
            className="group w-full flex items-center gap-4 py-2 cursor-pointer"
          >
            <div className="flex-1 h-px bg-border/40 group-hover:bg-border/70 transition-colors" />
            <span className="shrink-0 flex items-center gap-2 text-[13px] text-muted-foreground/60 group-hover:text-foreground/70 transition-colors select-none">
              <Clock className="size-3.5" />
              {t('classroom.recentClassrooms')}
              <span className="text-[11px] tabular-nums opacity-60">{classrooms.length}</span>
              <motion.div
                animate={{ rotate: recentOpen ? 180 : 0 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
              >
                <ChevronDown className="size-3.5" />
              </motion.div>
            </span>
            <div className="flex-1 h-px bg-border/40 group-hover:bg-border/70 transition-colors" />
          </button>

          {/* Import session button */}
          <input
            ref={importInputRef}
            type="file"
            accept=".maic"
            className="hidden"
            onChange={handleImportFile}
          />
          <div className="flex justify-end mt-1">
            <button
              onClick={(e) => { e.stopPropagation(); handleImportClick(); }}
              className="flex items-center gap-1.5 text-[12px] text-muted-foreground/50 hover:text-foreground/70 transition-colors px-2 py-1 rounded-md hover:bg-muted/40"
            >
              <Upload className="size-3" />
              {t('classroom.importSession')}
            </button>
          </div>

          {/* Expandable content */}
          <AnimatePresence>
            {recentOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
                className="w-full overflow-hidden"
              >
                {/* ── Folder strip ── */}
                <FolderStrip
                  folders={folders}
                  classrooms={classrooms}
                  activeFolderId={activeFolderId}
                  editingFolderId={editingFolderId}
                  pendingDeleteFolderId={pendingDeleteFolderId}
                  onSelectFolder={setActiveFolderId}
                  onCreateFolder={handleCreateFolder}
                  onRenameFolder={handleRenameFolder}
                  onDeleteFolder={handleDeleteFolder}
                  onRequestDelete={setPendingDeleteFolderId}
                  onCancelDelete={() => setPendingDeleteFolderId(null)}
                  onEditingDone={() => setEditingFolderId(null)}
                />

                {/* ── Classroom grid ── */}
                {(() => {
                  const visible =
                    activeFolderId === null
                      ? classrooms
                      : classrooms.filter((c) => c.folderId === activeFolderId);
                  if (visible.length === 0) {
                    return (
                      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground/40">
                        <FolderOpen className="size-10 mb-3 opacity-30" />
                        <p className="text-sm">{t('folder.empty')}</p>
                      </div>
                    );
                  }
                  return (
                    <div className="pt-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-8">
                      {visible.map((classroom, i) => (
                        <motion.div
                          key={classroom.id}
                          initial={{ opacity: 0, y: 16 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.04, duration: 0.35, ease: 'easeOut' }}
                        >
                          <ClassroomCard
                            classroom={classroom}
                            slide={thumbnails[classroom.id]}
                            formatDate={formatDate}
                            onDelete={handleDelete}
                            onExport={handleExport}
                            onShare={(id, e) => {
                              e.stopPropagation();
                              openShareDialog(id, classroom.publishedUrl);
                            }}
                            onRename={handleRename}
                            onMove={handleMoveToFolder}
                            folders={folders}
                            confirmingDelete={pendingDeleteId === classroom.id}
                            onConfirmDelete={() => confirmDelete(classroom.id)}
                            onCancelDelete={() => setPendingDeleteId(null)}
                            onClick={() => router.push(`/classroom/${classroom.id}`)}
                          />
                        </motion.div>
                      ))}
                    </div>
                  );
                })()}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Footer — flows with content, at the very end */}
      <div className="mt-auto pt-12 pb-4 text-center text-xs text-muted-foreground/40">
        LYS — Curated E-Learning
      </div>

      {/* Share / Publish Dialog */}
      <AnimatePresence>
        {shareDialogId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={closeShareDialog}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-6"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-xl bg-violet-100 dark:bg-violet-900/30">
                  <Globe className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">
                    Share Classroom
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Anyone with the link can view this classroom
                  </p>
                </div>
                <button type="button" onClick={closeShareDialog} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 transition-colors">
                  <EyeOff className="w-4 h-4" />
                </button>
              </div>

              {/* Share target: local server vs Vercel vs custom base URL */}
              <div className="mb-4">
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Share via</p>
                <div className="flex rounded-xl border border-gray-200 dark:border-gray-700 p-0.5 bg-gray-50/80 dark:bg-gray-800/50">
                  {(
                    [
                      { id: 'local' as const, label: 'Local server' },
                      { id: 'vercel' as const, label: 'Vercel' },
                      { id: 'custom' as const, label: 'Custom URL' },
                    ] as const
                  ).map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setShareTarget(id);
                        if (id === 'custom') setShareShowManualUrl(true);
                      }}
                      className={cn(
                        'flex-1 py-1.5 px-2 rounded-lg text-[11px] font-semibold transition-colors',
                        shareTarget === id
                          ? 'bg-white dark:bg-gray-700 text-violet-700 dark:text-violet-300 shadow-sm'
                          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {shareTarget === 'vercel' && (
                <div className="mb-4 p-3 rounded-xl border bg-violet-50/60 dark:bg-violet-950/30 border-violet-200/60 dark:border-violet-800/40 text-xs text-violet-900 dark:text-violet-100">
                  <p className="font-semibold mb-1">Standalone site on Vercel</p>
                  <p className="text-violet-800/90 dark:text-violet-200/85 leading-relaxed">
                    Uploads this class and deploys a new production URL with only the student view. Your OpenMAIC
                    server must have{' '}
                    <code className="px-1 py-0.5 rounded bg-violet-100/80 dark:bg-violet-900/50 font-mono text-[10px]">
                      VERCEL_TOKEN
                    </code>{' '}
                    in{' '}
                    <code className="px-1 py-0.5 rounded bg-violet-100/80 dark:bg-violet-900/50 font-mono text-[10px]">
                      .env.local
                    </code>{' '}
                    (create a token under Vercel → Settings → Tokens).
                  </p>
                  {!shareServerLoading &&
                    shareServerInfo &&
                    !shareServerInfo.vercelDeployConfigured && (
                      <p className="mt-2 font-medium text-amber-800 dark:text-amber-200">
                        VERCEL_TOKEN is not detected on this server — add it and restart before publishing.
                      </p>
                    )}
                </div>
              )}

              {/* Server URL status badge (local / custom only) */}
              {(shareTarget === 'local' || shareTarget === 'custom') && (
              <div className="mb-4 p-3 rounded-xl border bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700">
                {shareServerLoading ? (
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Detecting server URL…
                  </div>
                ) : shareServerInfo ? (
                  <>
                    <div className="flex items-center gap-2 mb-2">
                      {shareServerInfo.isLocal ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                          Local only
                        </span>
                      ) : shareServerInfo.isTunneled ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                          Tunneled ({shareServerInfo.provider.replace('tunnel-', '')})
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                          {shareServerInfo.provider === 'vercel' ? 'Vercel' :
                           shareServerInfo.provider === 'railway' ? 'Railway' :
                           shareServerInfo.provider === 'fly' ? 'Fly.io' :
                           shareServerInfo.provider === 'render' ? 'Render' :
                           shareServerInfo.provider === 'manual' ? 'Custom URL' : 'Cloud hosted'}
                        </span>
                      )}
                      <span className="text-xs text-gray-500 dark:text-gray-400 truncate flex-1 min-w-0">
                        {shareServerInfo.url}
                      </span>
                    </div>

                    {/* Local warning */}
                    {shareServerInfo.isLocal && (
                      <div className="mb-2 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200/60 dark:border-orange-700/40 px-3 py-2 text-xs text-orange-700 dark:text-orange-300">
                        <strong>This URL only works on your device.</strong> To share with others, set a tunnel or enter your server&apos;s public IP/domain below.
                        {!shareShowManualUrl && (
                          <button type="button" onClick={() => setShareShowManualUrl(true)} className="ml-2 underline font-semibold">
                            Set public URL
                          </button>
                        )}
                      </div>
                    )}

                    {/* Tunnel ephemeral warning */}
                    {shareServerInfo.isTunneled && (
                      <p className="text-xs text-yellow-600 dark:text-yellow-400">
                        Tunnel URL changes on restart — shared links may break when the server stops.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-gray-500">Could not detect server URL.</p>
                )}

                {/* Manual URL override */}
                {(shareShowManualUrl || shareTarget === 'custom') && (
                  <div className="mt-2">
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">
                      {shareTarget === 'custom'
                        ? 'Public base URL for this OpenMAIC server (required)'
                        : "Your server's public URL (e.g. https://192.168.1.5:3000 or https://myclassroom.com)"}
                    </label>
                    <input
                      type="url"
                      value={shareManualUrl}
                      onChange={(e) => setShareManualUrl(e.target.value)}
                      placeholder="https://your-server.com"
                      className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-300"
                    />
                  </div>
                )}
                {!shareShowManualUrl && !shareServerInfo?.isLocal && shareTarget !== 'custom' && (
                  <button type="button" onClick={() => setShareShowManualUrl(true)} className="mt-1.5 text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline">
                    Use a different URL
                  </button>
                )}
              </div>
              )}

              {/* Already published — show student link + professor link */}
              {shareUrl && (
                <div className="mb-4 space-y-3">
                  {/* ── Student / Learner link ─────────────────────────────────── */}
                  <div className="p-3 rounded-xl bg-violet-50 dark:bg-violet-900/20 border border-violet-200/60 dark:border-violet-700/40">
                    <p className="text-xs font-semibold text-violet-700 dark:text-violet-300 mb-1.5 flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5" />
                      Student link
                      <span className="ml-auto font-normal text-[10px] text-violet-500 dark:text-violet-400">Share this with your students</span>
                    </p>
                    <p className="text-[11px] text-violet-600/70 dark:text-violet-400/70 mb-2">
                      Students get a read-only view. No editing, no exports.
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={studentShareUrl ?? ''}
                        className="flex-1 min-w-0 text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-gray-700 dark:text-gray-300 outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleCopyStudentUrl}
                        className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold transition-colors"
                      >
                        {shareCopiedStudent ? <Check className="w-3.5 h-3.5" /> : <Link className="w-3.5 h-3.5" />}
                        {shareCopiedStudent ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  </div>

                  {/* ── Professor / self-access link ───────────────────────────── */}
                  <details className="group">
                    <summary className="text-[11px] text-gray-400 dark:text-gray-500 cursor-pointer hover:text-gray-600 dark:hover:text-gray-300 select-none list-none flex items-center gap-1">
                      <span className="group-open:hidden">▶</span>
                      <span className="hidden group-open:inline">▼</span>
                      Your own access link (professor view)
                    </summary>
                    {professorShareUrl ? (
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={professorShareUrl}
                          className="flex-1 min-w-0 text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-gray-700 dark:text-gray-300 outline-none"
                        />
                        <button
                          type="button"
                          onClick={handleCopyProfessorUrl}
                          className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-xs font-semibold transition-colors"
                        >
                          {shareCopied ? <Check className="w-3.5 h-3.5" /> : <Link className="w-3.5 h-3.5" />}
                          {shareCopied ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                    ) : (
                      <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                        This Vercel deployment only includes the student experience. Open this classroom in your
                        local OpenMAIC app to edit or present from the professor view.
                      </p>
                    )}
                  </details>
                </div>
              )}

              {/* Include media toggle */}
              <label className="flex items-center gap-3 mb-4 cursor-pointer">
                <div
                  onClick={() => setShareIncludeMedia(!shareIncludeMedia)}
                  className={`relative w-9 h-5 rounded-full transition-colors ${shareIncludeMedia ? 'bg-violet-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                >
                  <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${shareIncludeMedia ? 'translate-x-4' : ''}`} />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Include audio &amp; media</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Visitors hear TTS narration and see generated images</p>
                </div>
              </label>

              {shareError && (
                <p className="mb-3 text-xs text-red-500 dark:text-red-400">{shareError}</p>
              )}

              <div className="flex gap-2">
                {shareUrl ? (
                  <>
                    <button
                      type="button"
                      onClick={handleUnpublish}
                      disabled={sharePublishing}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
                    >
                      {sharePublishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <EyeOff className="w-4 h-4" />}
                      Unpublish
                    </button>
                    <button
                      type="button"
                      onClick={handlePublish}
                      disabled={publishDisabled}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
                    >
                      {sharePublishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
                      {sharePublishing ? 'Publishing…' : 'Re-publish'}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={closeShareDialog}
                      className="px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handlePublish}
                      disabled={publishDisabled}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
                    >
                      {sharePublishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                      {sharePublishing ? 'Publishing…' : shareTarget === 'vercel' ? 'Deploy to Vercel' : 'Publish & Get Link'}
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Greeting Bar — avatar + "Hi, Name", click to edit in-place ────
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

function isCustomAvatar(src: string) {
  return src.startsWith('data:');
}

function GreetingBar() {
  const { t } = useI18n();
  const avatar = useUserProfileStore((s) => s.avatar);
  const nickname = useUserProfileStore((s) => s.nickname);
  const bio = useUserProfileStore((s) => s.bio);
  const setAvatar = useUserProfileStore((s) => s.setAvatar);
  const setNickname = useUserProfileStore((s) => s.setNickname);
  const setBio = useUserProfileStore((s) => s.setBio);

  const [open, setOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const displayName = nickname || t('profile.defaultNickname');

  // Click-outside to collapse
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setEditingName(false);
        setAvatarPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const startEditName = () => {
    setNameDraft(nickname);
    setEditingName(true);
    setTimeout(() => nameInputRef.current?.focus(), 50);
  };

  const commitName = () => {
    setNickname(nameDraft.trim());
    setEditingName(false);
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_AVATAR_SIZE) {
      toast.error(t('profile.fileTooLarge'));
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error(t('profile.invalidFileType'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d')!;
        const scale = Math.max(128 / img.width, 128 / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (128 - w) / 2, (128 - h) / 2, w, h);
        setAvatar(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div ref={containerRef} className="relative pl-4 pr-2 pt-3.5 pb-1 w-auto">
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleAvatarUpload}
      />

      {/* ── Collapsed pill (always in flow) ── */}
      {!open && (
        <div
          className="flex items-center gap-2.5 cursor-pointer transition-all duration-200 group rounded-full px-2.5 py-1.5 border border-border/50 text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 active:scale-[0.97]"
          onClick={() => setOpen(true)}
        >
          <div className="shrink-0 relative">
            <div className="size-8 rounded-full overflow-hidden ring-[1.5px] ring-border/30 group-hover:ring-violet-400/60 dark:group-hover:ring-violet-400/40 transition-all duration-300">
              <img src={avatar} alt="" className="size-full object-cover" />
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full bg-white dark:bg-slate-800 border border-border/40 flex items-center justify-center opacity-60 group-hover:opacity-100 transition-opacity">
              <Pencil className="size-[7px] text-muted-foreground/70" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="leading-none select-none flex items-center gap-1">
                  <span className="text-[13px] font-semibold text-foreground/85 group-hover:text-foreground transition-colors">
                    {t('home.greetingWithName', { name: displayName })}
                  </span>
                  <ChevronDown className="size-3 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors shrink-0" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={4}>
                {t('profile.editTooltip')}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      )}

      {/* ── Expanded panel (absolute, floating) ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            className="absolute left-4 top-3.5 z-50 w-64"
          >
            <div className="rounded-2xl bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm ring-1 ring-black/[0.04] dark:ring-white/[0.06] shadow-[0_1px_8px_-2px_rgba(0,0,0,0.06)] dark:shadow-[0_1px_8px_-2px_rgba(0,0,0,0.3)] px-2.5 py-2">
              {/* ── Row: avatar + name ── */}
              <div
                className="flex items-center gap-2.5 cursor-pointer transition-all duration-200"
                onClick={() => {
                  setOpen(false);
                  setEditingName(false);
                  setAvatarPickerOpen(false);
                }}
              >
                {/* Avatar */}
                <div
                  className="shrink-0 relative cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    setAvatarPickerOpen(!avatarPickerOpen);
                  }}
                >
                  <div className="size-8 rounded-full overflow-hidden ring-[1.5px] ring-violet-300/70 dark:ring-violet-500/40 transition-all duration-300">
                    <img src={avatar} alt="" className="size-full object-cover" />
                  </div>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full bg-white dark:bg-slate-800 border border-border/60 flex items-center justify-center"
                  >
                    <ChevronDown
                      className={cn(
                        'size-2 text-muted-foreground/70 transition-transform duration-200',
                        avatarPickerOpen && 'rotate-180',
                      )}
                    />
                  </motion.div>
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  {editingName ? (
                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        ref={nameInputRef}
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitName();
                          if (e.key === 'Escape') {
                            setEditingName(false);
                          }
                        }}
                        onBlur={commitName}
                        maxLength={20}
                        placeholder={t('profile.defaultNickname')}
                        className="flex-1 min-w-0 h-6 bg-transparent border-b border-border/80 text-[13px] font-semibold text-foreground outline-none placeholder:text-muted-foreground/40"
                      />
                      <button
                        onClick={commitName}
                        className="shrink-0 size-5 rounded flex items-center justify-center text-violet-500 hover:bg-violet-100 dark:hover:bg-violet-900/30"
                      >
                        <Check className="size-3" />
                      </button>
                    </div>
                  ) : (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        startEditName();
                      }}
                      className="group/name inline-flex items-center gap-1 cursor-pointer"
                    >
                      <span className="text-[13px] font-semibold text-foreground/85 group-hover/name:text-foreground transition-colors">
                        {displayName}
                      </span>
                      <Pencil className="size-2.5 text-muted-foreground/30 opacity-0 group-hover/name:opacity-100 transition-opacity" />
                    </span>
                  )}
                </div>

                {/* Collapse arrow */}
                <motion.div
                  initial={{ opacity: 0, y: -2 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="shrink-0 size-6 rounded-full flex items-center justify-center hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
                >
                  <ChevronUp className="size-3.5 text-muted-foreground/50" />
                </motion.div>
              </div>

              {/* ── Expandable content ── */}
              <div className="pt-2" onClick={(e) => e.stopPropagation()}>
                {/* Avatar picker */}
                <AnimatePresence>
                  {avatarPickerOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.15, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <div className="p-1 pb-2.5 flex items-center gap-1.5 flex-wrap">
                        {AVATAR_OPTIONS.map((url) => (
                          <button
                            key={url}
                            onClick={() => setAvatar(url)}
                            className={cn(
                              'size-7 rounded-full overflow-hidden bg-gray-50 dark:bg-gray-800 cursor-pointer transition-all duration-150',
                              'hover:scale-110 active:scale-95',
                              avatar === url
                                ? 'ring-2 ring-violet-400 dark:ring-violet-500 ring-offset-0'
                                : 'hover:ring-1 hover:ring-muted-foreground/30',
                            )}
                          >
                            <img src={url} alt="" className="size-full" />
                          </button>
                        ))}
                        <label
                          className={cn(
                            'size-7 rounded-full flex items-center justify-center cursor-pointer transition-all duration-150 border border-dashed',
                            'hover:scale-110 active:scale-95',
                            isCustomAvatar(avatar)
                              ? 'ring-2 ring-violet-400 dark:ring-violet-500 ring-offset-0 border-violet-300 dark:border-violet-600 bg-violet-50 dark:bg-violet-900/30'
                              : 'border-muted-foreground/30 text-muted-foreground/50 hover:border-muted-foreground/50',
                          )}
                          onClick={() => avatarInputRef.current?.click()}
                          title={t('profile.uploadAvatar')}
                        >
                          <ImagePlus className="size-3" />
                        </label>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Bio */}
                <UITextarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder={t('profile.bioPlaceholder')}
                  maxLength={200}
                  rows={2}
                  className="resize-none border-border/40 bg-transparent min-h-[72px] !text-[13px] !leading-relaxed placeholder:!text-[11px] placeholder:!leading-relaxed focus-visible:ring-1 focus-visible:ring-border/60"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Classroom Card — clean, minimal style ──────────────────────
function ClassroomCard({
  classroom,
  slide,
  formatDate,
  onDelete,
  onExport,
  onShare,
  onRename,
  onMove,
  folders,
  confirmingDelete,
  onConfirmDelete,
  onCancelDelete,
  onClick,
}: {
  classroom: StageListItem;
  slide?: Slide;
  formatDate: (ts: number) => string;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onExport: (id: string, e: React.MouseEvent) => void;
  onShare: (id: string, e: React.MouseEvent) => void;
  onRename: (id: string, newName: string) => void;
  onMove: (id: string, folderId: string | null) => void;
  folders: FolderRecord[];
  confirmingDelete: boolean;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onClick: () => void;
}) {
  const { t } = useI18n();
  const thumbRef = useRef<HTMLDivElement>(null);
  const [thumbWidth, setThumbWidth] = useState(0);
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [movePanelOpen, setMovePanelOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; right: number } | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const folderBtnRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Open the portal dropdown, anchored to the folder button's viewport position
  const openMovePanel = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (movePanelOpen) { setMovePanelOpen(false); return; }
    if (folderBtnRef.current) {
      const rect = folderBtnRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setMovePanelOpen(true);
  };

  // Close portal dropdown when clicking outside
  useEffect(() => {
    if (!movePanelOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        folderBtnRef.current && !folderBtnRef.current.contains(e.target as Node)
      ) {
        setMovePanelOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [movePanelOpen]);

  useEffect(() => {
    const el = thumbRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setThumbWidth(Math.round(entry.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (editing) nameInputRef.current?.focus();
  }, [editing]);

  const startRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setNameDraft(classroom.name);
    setEditing(true);
  };

  const commitRename = () => {
    if (!editing) return;
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== classroom.name) {
      onRename(classroom.id, trimmed);
    }
    setEditing(false);
  };

  return (
    <div className="group cursor-pointer relative" onClick={confirmingDelete ? undefined : onClick}>
      {/* Thumbnail — large radius, no border, subtle bg */}
      <div
        ref={thumbRef}
        className="relative w-full aspect-[16/9] rounded-2xl bg-slate-100 dark:bg-slate-800/80 overflow-hidden transition-transform duration-200 group-hover:scale-[1.02]"
      >
        {slide && thumbWidth > 0 ? (
          <ThumbnailSlide
            slide={slide}
            size={thumbWidth}
            viewportSize={slide.viewportSize ?? 1000}
            viewportRatio={slide.viewportRatio ?? 0.5625}
          />
        ) : !slide ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="size-12 rounded-2xl bg-gradient-to-br from-violet-100 to-blue-100 dark:from-violet-900/30 dark:to-blue-900/30 flex items-center justify-center">
              <span className="text-xl opacity-50">📄</span>
            </div>
          </div>
        ) : null}

        {/* Delete — top-right, only on hover */}
        <AnimatePresence>
          {!confirmingDelete && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <Button
                size="icon"
                variant="ghost"
                className="absolute top-2 right-2 size-7 opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 hover:bg-destructive/80 text-white hover:text-white backdrop-blur-sm rounded-full"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(classroom.id, e);
                }}
              >
                <Trash2 className="size-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="absolute top-2 right-11 size-7 opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 hover:bg-black/50 text-white hover:text-white backdrop-blur-sm rounded-full"
                onClick={startRename}
              >
                <Pencil className="size-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="absolute top-2 right-20 size-7 opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 hover:bg-black/50 text-white hover:text-white backdrop-blur-sm rounded-full"
                onClick={(e) => onExport(classroom.id, e)}
                title={t('classroom.exportSession')}
              >
                <Download className="size-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className={`absolute top-2 right-[116px] size-7 opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm rounded-full ${classroom.publishedUrl ? 'bg-violet-500/80 hover:bg-violet-600 text-white hover:text-white' : 'bg-black/30 hover:bg-black/50 text-white hover:text-white'}`}
                onClick={(e) => onShare(classroom.id, e)}
                title={classroom.publishedUrl ? 'Manage shared link' : 'Share classroom'}
              >
                {classroom.publishedUrl ? <Globe className="size-3.5" /> : <Share2 className="size-3.5" />}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Inline delete confirmation overlay */}
        <AnimatePresence>
          {confirmingDelete && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/50 backdrop-blur-[6px]"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="text-[13px] font-medium text-white/90">
                {t('classroom.deleteConfirmTitle')}?
              </span>
              <div className="flex gap-2">
                <button
                  className="px-3.5 py-1 rounded-lg text-[12px] font-medium bg-white/15 text-white/80 hover:bg-white/25 backdrop-blur-sm transition-colors"
                  onClick={onCancelDelete}
                >
                  {t('common.cancel')}
                </button>
                <button
                  className="px-3.5 py-1 rounded-lg text-[12px] font-medium bg-red-500/90 text-white hover:bg-red-500 transition-colors"
                  onClick={onConfirmDelete}
                >
                  {t('classroom.delete')}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Move-to-folder trigger button — sits on the card, outside overflow-hidden thumbnail */}
      <div className="absolute top-2 right-[160px] z-20">
        <Button
          ref={folderBtnRef}
          size="icon"
          variant="ghost"
          className={`size-7 opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm rounded-full ${classroom.folderId ? 'bg-amber-500/80 hover:bg-amber-600 text-white hover:text-white' : 'bg-black/30 hover:bg-black/50 text-white hover:text-white'}`}
          onClick={openMovePanel}
          title="Move to folder"
        >
          <Folder className="size-3.5" />
        </Button>
      </div>

      {/* Dropdown rendered in a portal so it escapes ALL overflow-hidden ancestors */}
      {movePanelOpen && dropdownPos && createPortal(
        <AnimatePresence>
          <motion.div
            ref={dropdownRef}
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.15 }}
            style={{ position: 'fixed', top: dropdownPos.top, right: dropdownPos.right, zIndex: 9999 }}
            className="w-52 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800">
              <p className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wide">{t('folder.moveTo')}</p>
            </div>
            <div className="max-h-52 overflow-y-auto py-1">
              <button
                className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-[13px] text-left hover:bg-muted/60 transition-colors ${!classroom.folderId ? 'text-violet-600 dark:text-violet-400 font-medium' : 'text-foreground/80'}`}
                onClick={() => { onMove(classroom.id, null); setMovePanelOpen(false); }}
              >
                <X className="size-3.5 opacity-50" />
                {t('folder.noFolder')}
                {!classroom.folderId && <Check className="size-3 ml-auto" />}
              </button>
              {folders.map((folder) => (
                <button
                  key={folder.id}
                  className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-[13px] text-left hover:bg-muted/60 transition-colors ${classroom.folderId === folder.id ? 'text-violet-600 dark:text-violet-400 font-medium' : 'text-foreground/80'}`}
                  onClick={() => { onMove(classroom.id, folder.id); setMovePanelOpen(false); }}
                >
                  <Folder className="size-3.5 opacity-60" />
                  <span className="truncate flex-1">{folder.name}</span>
                  {classroom.folderId === folder.id && <Check className="size-3 ml-auto shrink-0" />}
                </button>
              ))}
              {folders.length === 0 && (
                <p className="px-3 py-2 text-[12px] text-muted-foreground/50">{t('folder.noFoldersYet')}</p>
              )}
            </div>
          </motion.div>
        </AnimatePresence>,
        document.body,
      )}

      {/* Info — outside the thumbnail */}
      <div className="mt-2.5 px-1 flex items-center gap-2">
        <span className="shrink-0 inline-flex items-center rounded-full bg-violet-100 dark:bg-violet-900/30 px-2 py-0.5 text-[11px] font-medium text-violet-600 dark:text-violet-400">
          {classroom.sceneCount} {t('classroom.slides')} · {formatDate(classroom.updatedAt)}
        </span>
        {classroom.publishedUrl && (
          <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-green-100 dark:bg-green-900/30 px-2 py-0.5 text-[11px] font-medium text-green-600 dark:text-green-400">
            <Globe className="w-2.5 h-2.5" />
            Published
          </span>
        )}
        {classroom.lastSceneIndex !== undefined && classroom.sceneCount > 0 && (
          <div className="flex-1 min-w-0 flex items-center gap-1.5">
            <div className="h-1 flex-1 rounded-full bg-muted/50 overflow-hidden">
              <div
                className="h-full rounded-full bg-violet-400/60"
                style={{
                  width: `${Math.min(100, Math.round(((classroom.lastSceneIndex + 1) / classroom.sceneCount) * 100))}%`,
                }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground/50 tabular-nums">
              {classroom.lastSceneIndex + 1}/{classroom.sceneCount}
            </span>
          </div>
        )}
        {editing ? (
          <div className="flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
            <input
              ref={nameInputRef}
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') setEditing(false);
              }}
              onBlur={commitRename}
              maxLength={100}
              placeholder={t('classroom.renamePlaceholder')}
              className="w-full bg-transparent border-b border-violet-400/60 text-[15px] font-medium text-foreground/90 outline-none placeholder:text-muted-foreground/40"
            />
          </div>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <p
                className="font-medium text-[15px] truncate text-foreground/90 min-w-0 cursor-text"
                onDoubleClick={startRename}
              >
                {classroom.name}
              </p>
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              sideOffset={4}
              className="!max-w-[min(90vw,32rem)] break-words whitespace-normal"
            >
              <div className="flex items-center gap-1.5">
                <span className="break-all">{classroom.name}</span>
                <button
                  className="shrink-0 p-0.5 rounded hover:bg-foreground/10 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(classroom.name);
                    toast.success(t('classroom.nameCopied'));
                  }}
                >
                  <Copy className="size-3 opacity-60" />
                </button>
              </div>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

// ─── FolderStrip ──────────────────────────────────────────────────────────────
function FolderStrip({
  folders,
  classrooms,
  activeFolderId,
  editingFolderId,
  pendingDeleteFolderId,
  onSelectFolder,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onRequestDelete,
  onCancelDelete,
  onEditingDone,
}: {
  folders: FolderRecord[];
  classrooms: StageListItem[];
  activeFolderId: string | null;
  editingFolderId: string | null;
  pendingDeleteFolderId: string | null;
  onSelectFolder: (id: string | null) => void;
  onCreateFolder: () => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  onRequestDelete: (id: string) => void;
  onCancelDelete: () => void;
  onEditingDone: () => void;
}) {
  const { t } = useI18n();
  const allCount = classrooms.length;

  return (
    <div className="mt-6 mb-2 flex items-center gap-2 flex-wrap">
      {/* "All" chip */}
      <button
        onClick={() => onSelectFolder(null)}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-all border',
          activeFolderId === null
            ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
            : 'bg-white/60 dark:bg-slate-800/60 text-muted-foreground border-border/40 hover:border-border/80 hover:text-foreground',
        )}
      >
        <FolderOpen className="size-3.5" />
        {t('folder.allClassrooms')}
        <span className={cn('tabular-nums text-[11px]', activeFolderId === null ? 'opacity-80' : 'opacity-50')}>
          {allCount}
        </span>
      </button>

      {/* Individual folder chips */}
      {folders.map((folder) => {
        const count = classrooms.filter((c) => c.folderId === folder.id).length;
        const isActive = activeFolderId === folder.id;
        const isEditing = editingFolderId === folder.id;
        const isPendingDelete = pendingDeleteFolderId === folder.id;

        return (
          <FolderChip
            key={folder.id}
            folder={folder}
            count={count}
            isActive={isActive}
            isEditing={isEditing}
            isPendingDelete={isPendingDelete}
            onSelect={() => onSelectFolder(folder.id)}
            onRename={(name) => { onRenameFolder(folder.id, name); onEditingDone(); }}
            onRequestDelete={() => onRequestDelete(folder.id)}
            onConfirmDelete={() => onDeleteFolder(folder.id)}
            onCancelDelete={onCancelDelete}
          />
        );
      })}

      {/* New folder button */}
      <button
        onClick={onCreateFolder}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium border border-dashed border-border/50 text-muted-foreground/60 hover:text-foreground hover:border-border/80 transition-all"
      >
        <FolderPlus className="size-3.5" />
        {t('folder.newFolder')}
      </button>
    </div>
  );
}

// ─── FolderChip ───────────────────────────────────────────────────────────────
function FolderChip({
  folder,
  count,
  isActive,
  isEditing,
  isPendingDelete,
  onSelect,
  onRename,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
}: {
  folder: FolderRecord;
  count: number;
  isActive: boolean;
  isEditing: boolean;
  isPendingDelete: boolean;
  onSelect: () => void;
  onRename: (name: string) => void;
  onRequestDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(folder.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      setDraft(folder.name);
      setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 30);
    }
  }, [isEditing, folder.name]);

  const commitRename = () => {
    const trimmed = draft.trim();
    if (trimmed) onRename(trimmed);
  };

  if (isPendingDelete) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300">
        <Trash2 className="size-3.5" />
        <span>{t('folder.deleteConfirm')}</span>
        <button onClick={onConfirmDelete} className="ml-1 underline font-semibold hover:text-red-900 dark:hover:text-red-100">
          {t('common.delete')}
        </button>
        <button onClick={onCancelDelete} className="opacity-60 hover:opacity-100">
          <X className="size-3.5" />
        </button>
      </div>
    );
  }

  if (isEditing) {
    return (
      <div className="flex items-center gap-1 px-2 py-1 rounded-full border border-violet-400 bg-white dark:bg-slate-900 shadow-sm">
        <Folder className="size-3.5 text-violet-500 shrink-0" />
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename();
            if (e.key === 'Escape') onRename(folder.name);
          }}
          onBlur={commitRename}
          maxLength={50}
          className="text-[12px] font-medium bg-transparent outline-none w-28 text-foreground placeholder:text-muted-foreground/40"
          placeholder="Folder name"
        />
      </div>
    );
  }

  return (
    <div className="group/chip relative flex items-center">
      <button
        onClick={onSelect}
        className={cn(
          'flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-full text-[12px] font-medium transition-all border',
          isActive
            ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
            : 'bg-white/60 dark:bg-slate-800/60 text-muted-foreground border-border/40 hover:border-border/80 hover:text-foreground',
        )}
      >
        <Folder className="size-3.5" />
        <span className="max-w-[120px] truncate">{folder.name}</span>
        <span className={cn('tabular-nums text-[11px]', isActive ? 'opacity-80' : 'opacity-50')}>
          {count}
        </span>
        {/* Inline action buttons — visible on chip hover */}
        <span
          className="ml-1 flex items-center gap-0.5 opacity-0 group-hover/chip:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <span
            title={t('folder.rename')}
            className={cn(
              'size-4 rounded flex items-center justify-center transition-colors cursor-pointer',
              isActive ? 'hover:bg-white/20' : 'hover:bg-muted',
            )}
            onClick={onSelect}
            onDoubleClick={(e) => { e.stopPropagation(); onRename(folder.name); }}
          >
            <Pencil
              className="size-2.5"
              onClick={(e) => { e.stopPropagation(); onRename(folder.name); }}
            />
          </span>
          <span
            title={t('folder.delete')}
            className={cn(
              'size-4 rounded flex items-center justify-center transition-colors cursor-pointer',
              isActive ? 'hover:bg-red-400/30' : 'hover:bg-red-100 dark:hover:bg-red-900/30',
            )}
            onClick={(e) => { e.stopPropagation(); onRequestDelete(); }}
          >
            <Trash2 className={cn('size-2.5', isActive ? 'text-white/80' : 'text-red-500')} />
          </span>
        </span>
      </button>
    </div>
  );
}

export default function Page() {
  return <HomePage />;
}
