export const COLLECTIONS: string[]
export interface Backup {
  name: string
  size: number
  createdAt: string
  sha256: string | null
}
export interface Status {
  engine: 'sqlite'
  path: string
  size: number
  rev: number
  savedAt: string | null
  lastBackupAt: string | null
  lastBackupOk: boolean
  version: number
  counts: Record<string, number>
  backups: Backup[]
  backupDir: string
}
export interface Store {
  db(): import('node:sqlite').DatabaseSync
  path: string
  isEmpty(): boolean
  readAll(): Record<string, any>
  write(patch: Record<string, unknown>): { savedAt: string; rev: number }
  applyOps(ops: Record<string, unknown>): { savedAt: string; rev: number }
  rev(): number
  backup(keep?: number): string
  maybeDailyBackup(): string | null
  listBackups(): Backup[]
  backupDir: string
  status(): Status
  snapshotTo(file: string): void
  restoreFrom(file: string): { preRestoreBackup: string | null }
  close(): void
}
export function openDatabase(path: string): Store
export function checkIntegrity(file: string): string | null
