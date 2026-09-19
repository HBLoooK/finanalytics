// A tiny queue for celebrations, kept out of the data store so a burst of
// confetti can never end up persisted into your database.
import { create } from 'zustand'
import { uid } from './utils'

export type CelebrationKind = 'level' | 'badge' | 'quest' | 'streak' | 'title'

export interface CelebrationItem {
  id: string
  kind: CelebrationKind
  title: string
  body?: string
  icon?: string
}

interface CelebrationState {
  queue: CelebrationItem[]
  push: (c: Omit<CelebrationItem, 'id'>) => void
  shift: () => void
  clear: () => void
}

export const useCelebrations = create<CelebrationState>((set) => ({
  queue: [],
  push: (c) => set((s) => ({ queue: [...s.queue, { ...c, id: uid() }].slice(-6) })),
  shift: () => set((s) => ({ queue: s.queue.slice(1) })),
  clear: () => set({ queue: [] }),
}))

/** Fire-and-forget helper used by the store so callers never import the hook. */
export const celebrate = (c: Omit<CelebrationItem, 'id'>) => useCelebrations.getState().push(c)
