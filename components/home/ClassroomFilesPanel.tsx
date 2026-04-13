'use client';

import { useState, useEffect } from 'react';
import { FileText, Download, Calendar, PencilLine, Eye } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { db } from '@/lib/utils/database';
import { loadPdfBlob } from '@/lib/utils/image-storage';
import type { StageRecord } from '@/lib/utils/database';
import { WhiteboardPreviewModal } from './whiteboard-preview-modal';
import { cn } from '@/lib/utils';

interface ClassroomFile {
  id: string;
  name: string;
  fileName: string;
  fileType: string;
  fileKey: string;
  sessionDate?: number;
  generationMode?: 'ai' | 'from-slides';
}

interface ClassroomWhiteboard {
  id: string;
  name: string;
  whiteboard: string;
  sessionDate?: number;
  updatedAt: number;
}

interface ClassroomFilesPanelProps {
  classroomId: string;
}

type Tab = 'documents' | 'whiteboards';

export function ClassroomFilesPanel({ classroomId }: ClassroomFilesPanelProps) {
  const { t } = useI18n();
  const [files, setFiles] = useState<ClassroomFile[]>([]);
  const [whiteboards, setWhiteboards] = useState<ClassroomWhiteboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('documents');
  const [previewWb, setPreviewWb] = useState<ClassroomWhiteboard | null>(null);

  useEffect(() => {
    loadResources();
  }, [classroomId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadResources = async () => {
    try {
      const stages = await db.stages.where('classroomId').equals(classroomId).toArray();

      const fileList: ClassroomFile[] = stages
        .filter((stage: StageRecord) => !!stage.sourceFileKey)
        .map((stage) => ({
          id: stage.id,
          name: stage.name,
          fileName: stage.sourceFileName || 'Unknown file',
          fileType: stage.sourceFileType || 'application/octet-stream',
          fileKey: stage.sourceFileKey!,
          sessionDate: stage.sessionDate,
          generationMode: stage.generationMode,
        }));

      const wbList: ClassroomWhiteboard[] = stages
        .filter((stage: StageRecord) => !!stage.whiteboard)
        .map((stage) => ({
          id: stage.id,
          name: stage.name,
          whiteboard: stage.whiteboard!,
          sessionDate: stage.sessionDate,
          updatedAt: stage.updatedAt,
        }));

      setFiles(fileList);
      setWhiteboards(wbList);
    } catch (error) {
      console.error('Failed to load resources:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (file: ClassroomFile) => {
    try {
      const blob = await loadPdfBlob(file.fileKey);
      if (!blob) { alert('File not found'); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download file:', error);
    }
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Resources</h2>
        <div className="text-sm text-gray-500 dark:text-gray-400">{t('common.loading')}</div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Panel header + tabs */}
        <div className="px-6 pt-5 pb-0 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Resources</h2>
          <div className="flex gap-1">
            {(['documents', 'whiteboards'] as Tab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-t-lg border-b-2 transition-colors capitalize',
                  activeTab === tab
                    ? 'border-violet-500 text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300',
                )}
              >
                {tab === 'documents'
                  ? `Documents${files.length > 0 ? ` (${files.length})` : ''}`
                  : `Whiteboards${whiteboards.length > 0 ? ` (${whiteboards.length})` : ''}`}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="p-4 space-y-2">
          {activeTab === 'documents' && (
            <>
              {files.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-600 text-center py-6 italic">
                  No uploaded documents.
                </p>
              ) : (
                files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/30 shrink-0">
                        <FileText className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {file.fileName}
                          </p>
                          {file.generationMode === 'from-slides' && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 shrink-0">
                              {t('classroom.originalSlides')}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{file.name}</p>
                          {file.sessionDate && (
                            <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 shrink-0">
                              <Calendar className="w-3 h-3" />
                              <span>{new Date(file.sessionDate).toLocaleDateString()}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDownload(file); }}
                      className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors shrink-0"
                      title={t('classroom.downloadFile')}
                    >
                      <Download className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                    </button>
                  </div>
                ))
              )}
              {files.length > 0 && (
                <p className="text-xs text-gray-400 dark:text-gray-500 pt-1 px-1">
                  {t('classroom.filesReadOnly')}
                </p>
              )}
            </>
          )}

          {activeTab === 'whiteboards' && (
            <>
              {whiteboards.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-600 text-center py-6 italic">
                  No saved whiteboards. Open a class and use the whiteboard — it saves automatically.
                </p>
              ) : (
                whiteboards.map((wb) => (
                  <div
                    key={wb.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30 shrink-0">
                        <PencilLine className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {wb.name}
                        </p>
                        <div className="flex items-center gap-1 mt-1 text-xs text-gray-400 dark:text-gray-500">
                          <Calendar className="w-3 h-3" />
                          <span>
                            {new Date(wb.sessionDate ?? wb.updatedAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setPreviewWb(wb); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors text-xs font-medium shrink-0"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      View
                    </button>
                  </div>
                ))
              )}
            </>
          )}
        </div>
      </div>

      {/* Whiteboard preview modal */}
      <WhiteboardPreviewModal
        open={!!previewWb}
        onClose={() => setPreviewWb(null)}
        stageName={previewWb?.name ?? ''}
        whiteboardData={previewWb?.whiteboard ?? ''}
      />
    </>
  );
}
