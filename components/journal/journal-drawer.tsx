'use client';

/**
 * JournalDrawer
 *
 * Full-height right-side drawer that slides in from the right.
 * Controlled by the global useJournalUIStore.
 * Contains the full JournalView in compact mode (no sidebar).
 */

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, BookOpen } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useJournalUIStore } from '@/lib/store/journal-ui';

const JournalView = dynamic(
  () => import('./journal-view').then((m) => m.JournalView),
  { ssr: false },
);

export function JournalDrawer() {
  const { isOpen, close } = useJournalUIStore();

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, close]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="journal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-sm"
            onClick={close}
          />

          {/* Drawer */}
          <motion.div
            key="journal-drawer"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed inset-y-0 right-0 z-[61] w-full sm:w-[680px] flex flex-col bg-white dark:bg-gray-900 shadow-2xl"
          >
            {/* Drawer header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-200 dark:border-gray-800 shrink-0 bg-white/95 dark:bg-gray-900/95">
              <BookOpen className="w-5 h-5 text-violet-500" />
              <span className="flex-1 text-base font-bold text-gray-900 dark:text-white">
                My Journal
              </span>
              <button
                onClick={close}
                className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                title="Close journal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Journal content */}
            <div className="flex-1 overflow-hidden">
              <JournalView compact />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
