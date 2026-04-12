'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Plus, BookOpen } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import {
  getClassroom,
  getClassroomStages,
  listClassrooms,
  moveStageToClassroom,
  deleteStageData,
} from '@/lib/utils/stage-storage';
import type { ClassroomRecord, StageListItem } from '@/lib/utils/stage-storage';
import { CreateClassDialog } from '@/components/home/CreateClassDialog';
import { ClassroomFilesPanel } from '@/components/home/ClassroomFilesPanel';
import { ClassCard } from '@/components/home/ClassCard';
import { toast } from 'sonner';

export default function ClassroomDetailPage() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useParams();
  const classroomId = params.classroomId as string;

  const [classroom, setClassroom] = useState<ClassroomRecord | null>(null);
  const [classes, setClasses] = useState<StageListItem[]>([]);
  const [allClassrooms, setAllClassrooms] = useState<ClassroomRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [createClassOpen, setCreateClassOpen] = useState(false);

  useEffect(() => {
    loadClassroom();
  }, [classroomId]);

  const loadClassroom = async () => {
    try {
      const [classroomData, classesData, classroomsData] = await Promise.all([
        getClassroom(classroomId),
        getClassroomStages(classroomId),
        listClassrooms(),
      ]);

      if (!classroomData) {
        router.push('/');
        return;
      }

      setClassroom(classroomData);
      setClasses(classesData);
      setAllClassrooms(classroomsData);
    } catch (error) {
      console.error('Failed to load classroom:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenJournal = () => {
    router.push(`/journal/${classroomId}`);
  };

  const handleMoveClass = async (stageId: string, targetClassroomId: string | null) => {
    try {
      await moveStageToClassroom(stageId, targetClassroomId);
      toast.success(targetClassroomId ? 'Class moved successfully' : 'Class moved to unclassified');
      await loadClassroom();
    } catch (error) {
      console.error('Failed to move class:', error);
      toast.error('Failed to move class');
    }
  };

  const handleDeleteClass = async (stageId: string) => {
    if (!confirm(t('classroom.deleteClassConfirm'))) return;
    try {
      await deleteStageData(stageId);
      toast.success(t('classroom.deleteClassSuccess'));
      await loadClassroom();
    } catch (error) {
      console.error('Failed to delete class:', error);
      toast.error(t('classroom.deleteClassFailed'));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">{t('common.loading')}</div>
      </div>
    );
  }

  if (!classroom) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('common.backToHome')}
        </button>

        {/* Header */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                {classroom.name}
              </h1>
              {classroom.description && (
                <p className="text-gray-600 dark:text-gray-400">{classroom.description}</p>
              )}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setCreateClassOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              {t('classroom.addClass')}
            </button>
            <button
              onClick={handleOpenJournal}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <BookOpen className="w-4 h-4" />
              {t('classroom.openJournal')}
            </button>
          </div>
        </div>

        {/* Classroom Files */}
        <div className="mb-6">
          <ClassroomFilesPanel classroomId={classroomId} />
        </div>

        {/* Classes grid */}
        {classes.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
            <div className="text-gray-400 dark:text-gray-500 mb-4">
              <Plus className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium mb-2">{t('classroom.noClasses')}</p>
              <p className="text-sm">{t('classroom.createFirstClass')}</p>
            </div>
            <button
              onClick={() => setCreateClassOpen(true)}
              className="mt-6 px-6 py-3 rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-medium transition-colors"
            >
              {t('classroom.addClass')}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {classes.map((cls) => (
              <ClassCard
                key={cls.id}
                cls={cls}
                classrooms={allClassrooms}
                onMove={handleMoveClass}
                onDelete={handleDeleteClass}
                onClick={() => router.push(`/classroom/${cls.id}`)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create class dialog */}
      <CreateClassDialog
        open={createClassOpen}
        onOpenChange={setCreateClassOpen}
        classroomId={classroomId}
      />
    </div>
  );
}
