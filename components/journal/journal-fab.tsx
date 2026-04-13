'use client';

/**
 * JournalFAB
 *
 * Fixed floating action button (bottom-right) that opens/closes the journal drawer.
 * Hidden when the drawer is open (the drawer's close button takes over).
 */

import { BookOpen } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useJournalUIStore } from '@/lib/store/journal-ui';

export function JournalFAB() {
  const { isOpen, toggle } = useJournalUIStore();

  return (
    <AnimatePresence>
      {!isOpen && (
        <motion.button
          key="journal-fab"
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.7 }}
          transition={{ duration: 0.18 }}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.94 }}
          onClick={toggle}
          title="My Journal"
          aria-label="Open journal"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-lg shadow-violet-500/30 hover:shadow-violet-500/50 transition-shadow"
        >
          <BookOpen className="w-4 h-4" />
          <span className="text-sm font-semibold pr-0.5">Journal</span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
