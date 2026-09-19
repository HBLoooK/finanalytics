// Soft-delete / undo ring buffer. Destructive actions push an entry here; a toast offers Undo
// for a few seconds. The last 20 entries survive component unmounts (module-level store).
import { createStore, useStore as useZustand } from 'zustand'

export interface UndoEntry {
  id: string
  label: string // e.g. 'Deleted “Coffee”'
  undo: () => void
  at: number
}

const MAX = 20

interface UndoState {
  entries: UndoEntry[]
  push: (e: Omit<UndoEntry, 'id' | 'at'>) => string
  undo: (id?: string) => boolean
  dismiss: (id?: string) => void
}

export const undoStore = createStore<UndoState>((set, get) => ({
  entries: [],
  push: (e) => {
    const id = Math.random().toString(36).slice(2)
    set((s) => ({ entries: [...s.entries, { ...e, id, at: Date.now() }].slice(-MAX) }))
    return id
  },
  undo: (id) => {
    const s = get()
    const entry = id ? s.entries.find((x) => x.id === id) : s.entries[s.entries.length - 1]
    if (!entry) return false
    entry.undo()
    set({ entries: s.entries.filter((x) => x.id !== entry.id) })
    return true
  },
  dismiss: (id) => set((s) => ({ entries: id ? s.entries.filter((x) => x.id !== id) : [] })),
}))

export const useUndo = <T>(sel: (s: UndoState) => T) => useZustand(undoStore, sel)

let counter = 0
export const pushUndo = (label: string, undo: () => void) => undoStore.getState().push({ label, undo: () => { void counter; undo() } })
