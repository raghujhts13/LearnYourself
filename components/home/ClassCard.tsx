'use client';

import { MoreVertical, FolderInput, FolderMinus, Trash2, Share2 } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';
import type { StageListItem, ClassroomRecord } from '@/lib/utils/stage-storage';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';

interface ClassCardProps {
  cls: StageListItem;
  classrooms: ClassroomRecord[];
  onMove: (stageId: string, targetClassroomId: string | null) => void;
  onClick: () => void;
  onDelete?: (stageId: string) => void;
  onShare?: (stageId: string, publishedUrl?: string) => void;
}

export function ClassCard({ cls, classrooms, onMove, onClick, onDelete, onShare }: ClassCardProps) {
  const { t } = useI18n();
  const isUnassigned = !cls.classroomId;

  return (
    <div
      onClick={onClick}
      className={cn(
        'group relative bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700',
        'hover:shadow-lg hover:border-violet-300 dark:hover:border-violet-600 transition-all duration-200 cursor-pointer flex flex-col p-4 min-h-[120px]',
      )}
    >
      <div className="flex items-start justify-between gap-4 mb-3 flex-1">
        <h3 className="font-semibold text-gray-900 dark:text-white leading-snug line-clamp-2">
          {cls.name}
        </h3>
        
        <div onClick={(e) => e.stopPropagation()} className="shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="p-1.5 -mr-1.5 -mt-1.5 rounded-lg text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 focus:opacity-100"
              >
                <MoreVertical className="w-5 h-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-xs text-gray-500 font-normal">
                Move to...
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup className="max-h-[200px] overflow-y-auto">
                {classrooms.map((c) => {
                  const isCurrent = c.id === cls.classroomId;
                  return (
                    <DropdownMenuItem
                      key={c.id}
                      onClick={() => !isCurrent && onMove(cls.id, c.id)}
                      disabled={isCurrent}
                      className={cn('flex items-center gap-2', isCurrent && 'opacity-50')}
                    >
                      <FolderInput className="w-4 h-4 shrink-0 text-gray-400" />
                      <span className="truncate flex-1">{c.name}</span>
                      {isCurrent && <span className="text-[10px] text-gray-400 shrink-0">Current</span>}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuGroup>
              
              {!isUnassigned && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onMove(cls.id, null)}
                    className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400 focus:bg-red-50 dark:focus:bg-red-900/10 gap-2"
                  >
                    <FolderMinus className="w-4 h-4" />
                    <span>Unclassified</span>
                  </DropdownMenuItem>
                </>
              )}

              {onShare && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onShare(cls.id, cls.publishedUrl)}
                    className="gap-2"
                  >
                    <Share2 className="w-4 h-4 text-violet-500" />
                    <span>Share</span>
                    {cls.publishedUrl && (
                      <span className="ml-auto text-[10px] text-green-600 dark:text-green-400 font-medium">Published</span>
                    )}
                  </DropdownMenuItem>
                </>
              )}

              {onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onDelete(cls.id)}
                    className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400 focus:bg-red-50 dark:focus:bg-red-900/10 gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>{t('classroom.deleteClass')}</span>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 pt-3 border-t border-gray-100 dark:border-gray-800">
        <span className="flex items-center gap-1.5 font-medium text-gray-600 dark:text-gray-300">
          {cls.sceneCount} {t('classroom.slides')}
        </span>
        <span>{new Date(cls.sessionDate || cls.createdAt).toLocaleDateString()}</span>
      </div>
    </div>
  );
}
