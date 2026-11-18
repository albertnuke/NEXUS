import { protocol, net } from 'electron'
import { pathToFileURL } from 'node:url'
import { extname } from 'node:path'
import { resolveVaultFile } from '../filesystem/pathGuard'
import { isNoteId } from '@shared/validation'

/**
 * `nexus-asset://vault/embed?target=<as written>&from=<note id>` serves
 * images embedded in notes (e.g. `![[diagram.png]]`) read-only from the
 * connected vault. Only image types are served, targets are resolved against
 * the indexed attachment list, and every path passes the vault path guard.
 */

const ALLOWED = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif', '.bmp'])
const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp'
}

export function registerAssetScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'nexus-asset', privileges: { standard: true, secure: true, supportFetchAPI: false, stream: true } }
  ])
}

export interface AssetResolver {
  root(): string | null
  resolve(target: string, fromId: string): string | null
}

export function handleAssetProtocol(resolver: AssetResolver): void {
  protocol.handle('nexus-asset', async (request) => {
    try {
      const root = resolver.root()
      if (!root) return new Response('No vault', { status: 404 })
      const url = new URL(request.url)
      if (url.host !== 'vault' || url.pathname !== '/embed') return new Response('Not found', { status: 404 })
      const target = url.searchParams.get('target') ?? ''
      const from = url.searchParams.get('from') ?? ''
      if (!target || target.length > 2048 || !isNoteId(from)) return new Response('Bad request', { status: 400 })
      const rel = resolver.resolve(target, from)
      if (!rel) return new Response('Not found', { status: 404 })
      const ext = extname(rel).toLowerCase()
      if (!ALLOWED.has(ext)) return new Response('Forbidden', { status: 403 })
      const abs = await resolveVaultFile(root, rel)
      const res = await net.fetch(pathToFileURL(abs).toString())
      const headers = new Headers()
      headers.set('Content-Type', MIME[ext] ?? 'application/octet-stream')
      // SVGs could carry scripts; neutralise them with a restrictive CSP.
      headers.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:")
      headers.set('X-Content-Type-Options', 'nosniff')
      headers.set('Cache-Control', 'no-store')
      return new Response(res.body, { status: res.status, headers })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}
