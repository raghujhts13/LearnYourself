/**
 * Journal UI Store
 *
 * Ephemeral Zustand store controlling the global journal drawer open/close state.
 */

import { create } from 'zustand';

interface JournalUIState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export const useJournalUIStore = create<JournalUIState>()((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
}));
