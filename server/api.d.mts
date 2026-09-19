import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Store } from './db.mjs'
export function createApiHandler(
  store: Store,
  opts?: { log?: (m: string) => void; token?: string | null; attachmentsDir?: string },
): (req: IncomingMessage, res: ServerResponse, next?: () => void) => Promise<void>
export function isLoopback(host: string): boolean
