'use client';

import { useState, useEffect } from 'react';
import { FileText, Download, Calendar } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { db } from '@/lib/utils/database';
import { loadPdfBlob } from '@/lib/utils/image-storage';
import type { StageRecord } from '@/lib/utils/database';

interface ClassroomFile {
  id: string;
  name: string;
  fileName: string;
  fileType: string;
  fileKey: string;
  sessionDate?: number;
  generationMode?: 'ai' | 'from-slides';
}

interface ClassroomFilesPanelProps {
  classroomId: string;
}

export function ClassroomFilesPanel({ classroomId }: ClassroomFilesPanelProps) {
  const { t } = useI18n();
  const [files, setFiles] = useState<ClassroomFile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFiles();
  }, [classroomId]);

  const loadFiles = async () => {
    try {
      // Get all stages in this classroom that have source files
      const stages = await db.stages
        .where('classroomId')
        .equals(classroomId)
        .filter((stage: StageRecord) => !!stage.sourceFileKey)
        .toArray();

      const fileList: ClassroomFile[] = stages.map((stage) => ({
        id: stage.id,
        name: stage.name,
        fileName: stage.sourceFileName || 'Unknown file',
        fileType: stage.sourceFileType || 'application/octet-stream',
        fileKey: stage.sourceFileKey!,
        sessionDate: stage.sessionDate,
        generationMode: stage.generationMode,
      }));

      setFiles(fileList);
    } catch (error) {
      console.error('Failed to load files:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (file: ClassroomFile) => {
    try {
      const blob = await loadPdfBlob(file.fileKey);
      if (!blob) {
        alert('File not found');
        return;
      }

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
      alert('Failed to download file');
    }
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          {t('classroom.files')}
        </h2>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          {t('common.loading')}
        </div>
      </div>
    );
  }

  if (files.length === 0) {
    return null; // Don't show panel if no files
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        {t('classroom.files')} ({files.length})
      </h2>
      <div className="space-y-2">
        {files.map((file) => (
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
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {file.name}
                  </p>
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
              onClick={(e) => {
                e.stopPropagation();
                handleDownload(file);
              }}
              className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors shrink-0"
              title={t('classroom.downloadFile')}
            >
              <Download className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            </button>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
        {t('classroom.filesReadOnly')}
      </p>
    </div>
  );
}
