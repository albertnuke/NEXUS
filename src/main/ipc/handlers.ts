import { app, dialog, ipcMain, shell, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { IPC } from '@shared/ipc'
import type { AppInfo, ApplicationSettings } from '@shared/types'
import { isNoteId, isSafeExternalUrl, sanitizeQuery, sanitizeSettingsPatch } from '@shared/validation'
import type { VaultService } from '../vault/vaultService'
import type { SettingsStore } from '../settings/settingsStore'
import { buildObsidianUri } from '../electron/obsidian'
import { clearAllCaches } from '../layout/layoutCache'

export interface HandlerContext {
  getWindow: () => BrowserWindow | null
  vault: VaultService
  settings: SettingsStore
  cacheDir: string
  demoVaultPath: string
  isTrustedSender: (event: IpcMainInvokeEvent) => boolean
  appInfo: () => AppInfo
  applyLoginItem: (enabled: boolean) => void
}

/**
 * Registers narrowly-scoped IPC handlers. Every handler validates the
 * sender frame and its arguments; the renderer can never pass an arbitrary
 * filesystem path.
 */
export function registerIpcHandlers(ctx: HandlerContext): void {
  const handle = <A extends unknown[], R>(channel: string, fn: (...args: A) => R | Promise<R>) => {
    ipcMain.handle(channel, async (event, ...args: unknown[]) => {
      if (!ctx.isTrustedSender(event)) throw new Error('Untrusted sender')
      return fn(...(args as A))
    })
  }

  handle(IPC.getStatus, () => ctx.vault.getStatus())
  handle(IPC.getSnapshot, () => ctx.vault.getSnapshot())

  handle(IPC.selectVault, async () => {
    const win = ctx.getWindow()
    const options: Electron.OpenDialogOptions = {
      title: 'Connect Obsidian Vault',
      buttonLabel: 'Connect Vault',
      message: 'Choose the folder that contains your Obsidian vault.',
      properties: ['openDirectory', 'createDirectory', 'treatPackageAsDirectory']
    }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return { canceled: true }
    const path = result.filePaths[0]
    const s = ctx.settings.get()
    ctx.settings.update({ vaultPath: path, demoMode: false, lastCategory: null })
    void ctx.vault.open(path, { includeTxt: s.includeTxt })
    return { canceled: false }
  })

  handle(IPC.openDemo, async () => {
    ctx.settings.update({ demoMode: true, lastCategory: null })
    void ctx.vault.open(ctx.demoVaultPath, { isDemo: true })
    return true
  })

  handle(IPC.reindex, async () => {
    if (ctx.vault.rootPath) await ctx.vault.reindex()
    else {
      const s = ctx.settings.get()
      if (s.vaultPath) await ctx.vault.open(s.vaultPath, { includeTxt: s.includeTxt })
    }
    return true
  })

  handle(IPC.disconnect, async () => {
    ctx.settings.update({ vaultPath: null, demoMode: false, lastCategory: null })
    await ctx.vault.disconnect()
    return true
  })

  handle(IPC.getNote, async (id: unknown) => {
    if (!isNoteId(id)) throw new Error('Invalid note id')
    if (!ctx.vault.hasNote(id)) return { id, body: '', frontmatter: {}, mtime: 0, linkMap: {}, error: 'This note is no longer part of the vault.' }
    return ctx.vault.getNote(id)
  })

  handle(IPC.search, (query: unknown, limit: unknown) => {
    const q = sanitizeQuery(query)
    if (q === null) return []
    const n = typeof limit === 'number' && Number.isFinite(limit) ? Math.min(100, Math.max(1, Math.floor(limit))) : 40
    return ctx.vault.search(q, n)
  })

  handle(IPC.openInObsidian, async (id: unknown, newTab: unknown) => {
    if (!isNoteId(id) || !ctx.vault.hasNote(id)) return false
    const root = ctx.vault.rootPath
    if (!root || ctx.vault.demo) return false
    const mode = newTab === true ? 'tab' : newTab === false ? 'current' : ctx.settings.get().obsidianOpenMode
    await shell.openExternal(buildObsidianUri(root, id, mode))
    return true
  })

  handle(IPC.revealInFinder, (id: unknown) => {
    if (!isNoteId(id) || !ctx.vault.hasNote(id)) return false
    const root = ctx.vault.rootPath
    if (!root) return false
    shell.showItemInFolder(`${root}/${id}`)
    return true
  })

  handle(IPC.openExternal, async (url: unknown) => {
    if (!isSafeExternalUrl(url)) return false
    await shell.openExternal(url)
    return true
  })

  handle(IPC.getSettings, () => ctx.settings.get())

  handle(IPC.updateSettings, (patch: unknown) => {
    const clean = sanitizeSettingsPatch(patch)
    const before = ctx.settings.get()
    const next: ApplicationSettings = ctx.settings.update(clean)
    if (clean.launchAtLogin !== undefined && clean.launchAtLogin !== before.launchAtLogin) {
      ctx.applyLoginItem(clean.launchAtLogin)
    }
    if (clean.includeTxt !== undefined && clean.includeTxt !== before.includeTxt && next.vaultPath && !next.demoMode) {
      void ctx.vault.open(next.vaultPath, { includeTxt: next.includeTxt })
    }
    return next
  })

  handle(IPC.clearCache, async () => {
    await clearAllCaches(ctx.cacheDir)
    return true
  })

  handle(IPC.getAppInfo, () => ctx.appInfo())

  void app
}
