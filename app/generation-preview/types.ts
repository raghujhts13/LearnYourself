import { ScanLine, Search, FileText, LayoutPanelLeft, Clapperboard } from 'lucide-react';
import type {
  SceneOutline,
  UserRequirements,
  PdfImage,
  ImageMapping,
} from '@/lib/types/generation';

/**
 * One uploaded source file in a multi-file generation session.
 */
export interface SourceFileEntry {
  storageKey: string;
  fileName: string;
  fileSize?: number;
  providerId?: string;
  providerConfig?: { apiKey?: string; baseUrl?: string };
}

// Session state stored in sessionStorage
export interface GenerationSessionState {
  sessionId: string;
  requirements: UserRequirements;
  pdfText: string;
  pdfImages?: PdfImage[];
  imageStorageIds?: string[];
  imageMapping?: ImageMapping;
  sceneOutlines?: SceneOutline[] | null;
  currentStep: 'generating' | 'complete';
  // ── Multi-file source files (new) ──
  sourceFiles?: SourceFileEntry[];
  // ── Legacy single-file fields (kept for backward compat + ClassroomFilesPanel) ──
  pdfStorageKey?: string;
  pdfFileName?: string;
  pdfProviderId?: string;
  pdfProviderConfig?: { apiKey?: string; baseUrl?: string };
  // Web search context
  researchContext?: string;
  researchSources?: Array<{ title: string; url: string }>;
  // Classroom assignment
  classroomId?: string;
}

export type GenerationStep = {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  type: 'analysis' | 'writing' | 'visual';
};

export const ALL_STEPS: GenerationStep[] = [
  {
    id: 'pdf-analysis',
    title: 'generation.analyzingPdf',
    description: 'generation.analyzingPdfDesc',
    icon: ScanLine,
    type: 'analysis',
  },
  {
    id: 'web-search',
    title: 'generation.webSearching',
    description: 'generation.webSearchingDesc',
    icon: Search,
    type: 'analysis',
  },
  {
    id: 'outline',
    title: 'generation.generatingOutlines',
    description: 'generation.generatingOutlinesDesc',
    icon: FileText,
    type: 'writing',
  },
  {
    id: 'slide-content',
    title: 'generation.generatingSlideContent',
    description: 'generation.generatingSlideContentDesc',
    icon: LayoutPanelLeft,
    type: 'visual',
  },
  {
    id: 'actions',
    title: 'generation.generatingActions',
    description: 'generation.generatingActionsDesc',
    icon: Clapperboard,
    type: 'visual',
  },
];

export const getActiveSteps = (session: GenerationSessionState | null) => {
  return ALL_STEPS.filter((step) => {
    if (step.id === 'pdf-analysis')
      return !!(session?.sourceFiles?.length || session?.pdfStorageKey);
    if (step.id === 'web-search') return !!session?.requirements?.webSearch;
    return true;
  });
};
