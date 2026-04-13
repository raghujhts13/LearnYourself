'use client';

import { ArrowLeft, BookOpen } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { JournalView } from '@/components/journal/journal-view';

export default function JournalPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex flex-col">
      {/* Page header */}
      <div className="shrink-0 px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          title="Go back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <BookOpen className="w-5 h-5 text-violet-500" />
        <h1 className="text-lg font-bold text-gray-900 dark:text-white">My Journal</h1>
      </div>

      {/* Journal content */}
      <div className="flex-1 overflow-hidden">
        <JournalView />
      </div>
    </div>
  );
}
