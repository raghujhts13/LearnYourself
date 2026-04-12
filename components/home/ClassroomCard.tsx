'use client';

import { useState } from 'react';
import { MoreVertical, FolderOpen, Plus, BookOpen, Trash2, Edit3 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';
import type { ClassroomRecord } from '@/lib/utils/stage-storage';

interface ClassroomCardProps {
  classroom: ClassroomRecord;
  classCount: number;
  lastActiveDate?: number;
  onDelete?: () => void;
  onRename?: () => void;
  onAddClass?: () => void;
  onOpenJournal?: () => void;
}

export function ClassroomCard({
  classroom,
  classCount,
  lastActiveDate,
  onDelete,
  onRename,
  onAddClass,
  onOpenJournal,
}: ClassroomCardProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return t('classroom.today');
    if (diffDays === 1) return t('classroom.yesterday');
    if (diffDays < 7) return `${diffDays} ${t('classroom.daysAgo')}`;
    return date.toLocaleDateString();
  };

  const handleOpenClassroom = () => {
    router.push(`/classroom-group/${classroom.id}`);
  };

  return (
    <div
      className={cn(
        'group relative bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700',
        'hover:shadow-lg hover:border-violet-300 dark:hover:border-violet-600 transition-all duration-200',
        'overflow-hidden cursor-pointer',
      )}
      onClick={handleOpenClassroom}
    >
      {/* Gradient header */}
      <div className="h-24 bg-gradient-to-br from-violet-400 via-purple-400 to-pink-400 relative">
        <div className="absolute inset-0 bg-black/5" />
        <div className="absolute top-2 right-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(!menuOpen);
            }}
            className="p-1.5 rounded-lg bg-white/90 dark:bg-gray-800/90 hover:bg-white dark:hover:bg-gray-800 transition-colors"
          >
            <MoreVertical className="w-4 h-4 text-gray-700 dark:text-gray-300" />
          </button>

          {/* Dropdown menu */}
          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                }}
              />
              <div className="absolute right-0 top-10 z-20 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    onAddClass?.();
                  }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  {t('classroom.addClass')}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    onOpenJournal?.();
                  }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                >
                  <BookOpen className="w-4 h-4" />
                  {t('classroom.openJournal')}
                </button>
                <div className="my-1 h-px bg-gray-200 dark:bg-gray-700" />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    onRename?.();
                  }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                >
                  <Edit3 className="w-4 h-4" />
                  {t('classroom.rename')}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    onDelete?.();
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  {t('classroom.delete')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="flex items-start gap-3 mb-3">
          <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/30">
            <FolderOpen className="w-5 h-5 text-violet-600 dark:text-violet-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 dark:text-white truncate mb-1">
              {classroom.name}
            </h3>
            {classroom.description && (
              <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                {classroom.description}
              </p>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span className="flex items-center gap-1">
            <span className="font-medium text-violet-600 dark:text-violet-400">{classCount}</span>
            {classCount === 1 ? t('classroom.class') : t('classroom.classes')}
          </span>
          {lastActiveDate && <span>{formatDate(lastActiveDate)}</span>}
        </div>
      </div>

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-violet-600/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
    </div>
  );
}
