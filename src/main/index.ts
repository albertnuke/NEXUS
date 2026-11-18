import { app, BrowserWindow, nativeTheme, screen, session, systemPreferences, type IpcMainInvokeEvent } from 'electron'
import { join } from 'node:path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import createLayoutWorker from './layout/layout.worker?nodeWorker'
import { IPC } from '@shared/ipc'
import type { MenuCommand } from '@shared/types'
import { VaultService, type LayoutRunner } from './vault/vaultService'
import { SettingsStore } from './settings/settingsStore'
import { registerIpcHandlers } from './ipc/handlers'
import { buildMenu } from './electron/menu'
import { registerAssetScheme, handleAssetProtocol } from './electron/protocol'
import type { LayoutOutput } from './layout/layoutEngine'

/* ------------------------------------------------------------------ */
/* Identity & paths                                                    */
/* ------------------------------------------------------------------ */

app.setName('NEXUS')
// Settings and caches live in ~/Library/Application Support/NEXUS (overridable for tests).
const userDataDir = process.env.NEXUS_USER_DATA_DIR || join(app.getPath('appData'), 'NEXUS')
app.setPath('userData', userDataDir)
app.setPath('sessionData', join(userDataDir, 'Session'))
const cacheDir = join(userDataDir, 'Cache', 'layouts')
const isDev = !app.isPackaged && !!process.env.ELECTRON_RENDERER_URL
const isE2E = process.env.NEXUS_E2E === '1'

// Single instance: a second launch focuses the existing window.
if (!isE2E && !app.requestSingleInstanceLock()) {
  app.quit()
}

registerAssetScheme()

const resourcesDir = app.isPackaged ? process.resourcesPath : join(__dirname, '../../resources')
const demoVaultPath = join(resourcesDir, 'demo-vault')

/* ------------------------------------------------------------------ */
/* Layout worker                                                       */
/* ------------------------------------------------------------------ */

let worker: ReturnType<typeof createLayoutWorker> | null = null
let jobId = 0
const pending = new Map<number, { resolve: (o: LayoutOutput) => void; reject: (e: Error) => void }>()

const runLayout: LayoutRunner = (input) => {
  if (!worker) {
    worker = createLayoutWorker({})
    worker.on('message', (msg: { id: number; output?: LayoutOutput; error?: string }) => {
      const job = pending.get(msg.id)
      if (!job) return
      pending.delete(msg.id)
      if (msg.output) job.resolve(msg.output)
      else job.reject(new Error(msg.error ?? 'Layout failed'))
    })
    worker.on('error', (err) => {
      for (const job of pending.values()) job.reject(err)
      pending.clear()
      worker = null
    })
  }
  const id = ++jobId
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    worker!.postMessage({ id, input })
  })
}

/* ------------------------------------------------------------------ */
/* Services                                                            */
/* ------------------------------------------------------------------ */

const settings = new SettingsStore(userDataDir)
const vault = new VaultService({ cacheDir, runLayout })
let mainWindow: BrowserWindow | null = null

function send(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload)
}

vault.on('status', (s) => send(IPC.statusEvent, s))
vault.on('snapshot', (s) => send(IPC.snapshotEvent, s))
settings.on('change', (s) => send(IPC.settingsEvent, s))

/* ------------------------------------------------------------------ */
/* Window                                                              */
/* ------------------------------------------------------------------ */

interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  fullscreen?: boolean
}
const windowStateFile = join(userDataDir, 'window-state.json')

function loadWindowState(): WindowState {
  const fallback: WindowState = { width: 1440, height: 900 }
  try {
    const s = JSON.parse(readFileSync(windowStateFile, 'utf8')) as WindowState
    const area = screen.getPrimaryDisplay().workAreaSize
    if (typeof s.width !== 'number' || typeof s.height !== 'number') return fallback
    return {
      ...s,
      width: Math.min(Math.max(960, s.width), Math.max(area.width, 960)),
      height: Math.min(Math.max(640, s.height), Math.max(area.height, 640))
    }
  } catch {
    const area = screen.getPrimaryDisplay().workAreaSize
    return { width: Math.min(1440, area.width), height: Math.min(900, area.height) }
  }
}

function saveWindowState(win: BrowserWindow): void {
  try {
    const b = win.getNormalBounds()
    mkdirSync(userDataDir, { recursive: true })
    writeFileSync(windowStateFile, JSON.stringify({ ...b, fullscreen: win.isFullScreen() }))
  } catch {
    /* non-fatal */
  }
}

const rendererFile = join(__dirname, '../renderer/index.html')
const rendererUrl = isDev ? process.env.ELECTRON_RENDERER_URL! : pathToFileURL(rendererFile).toString()

function isTrustedUrl(url: string): boolean {
  if (isDev) return url.startsWith(process.env.ELECTRON_RENDERER_URL!)
  return url.split('#')[0].split('?')[0] === rendererUrl
}

function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  const frame = event.senderFrame
  return !!frame && frame === mainWindow?.webContents.mainFrame && isTrustedUrl(frame.url)
}

function createWindow(): void {
  const state = loadWindowState()
  const win = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 960,
    minHeight: 620,
    show: false,
    title: 'NEXUS',
    backgroundColor: '#030304',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 20, y: 20 },
    fullscreenable: true,
    acceptFirstMouse: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
      backgroundThrottling: true,
      devTools: isDev || isE2E
    }
  })
  mainWindow = win
  if (state.fullscreen) win.setFullScreen(true)

  win.once('ready-to-show', () => {
    if (!process.env.NEXUS_HIDE_WINDOW) win.show()
  })
  win.on('close', () => saveWindowState(win))
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })
  const visibility = (visible: boolean) => () => send(IPC.visibilityEvent, visible)
  win.on('minimize', visibility(false))
  win.on('restore', visibility(true))
  win.on('hide', visibility(false))
  win.on('show', visibility(true))

  // Never navigate away from the app or open new windows.
  win.webContents.on('will-navigate', (e, url) => {
    if (!isTrustedUrl(url)) e.preventDefault()
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-attach-webview', (e) => e.preventDefault())

  void win.loadURL(rendererUrl)
}

/* ------------------------------------------------------------------ */
/* Lifecycle                                                           */
/* ------------------------------------------------------------------ */

function sendMenu(cmd: MenuCommand): void {
  if (!mainWindow) createWindow()
  send(IPC.menuEvent, cmd)
}

function applyLoginItem(enabled: boolean): void {
  try {
    app.setLoginItemSettings({ openAtLogin: enabled })
  } catch {
    /* unsupported in development builds */
  }
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

app.whenReady().then(async () => {
  nativeTheme.themeSource = 'dark'
  app.setAboutPanelOptions({
    applicationName: 'NEXUS',
    applicationVersion: app.getVersion(),
    credits: 'Made by Albert',
    copyright: '© 2026 Albert'
  })

  // Deny every permission request (camera, notifications, geolocation, ...).
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false))
  session.defaultSession.setPermissionCheckHandler(() => false)
  // Offline by design: block any network request that is not local app content.
  session.defaultSession.webRequest.onBeforeRequest((details, cb) => {
    const url = details.url
    const allowed =
      url.startsWith('file://') ||
      url.startsWith('nexus-asset://') ||
      url.startsWith('devtools://') ||
      url.startsWith('data:') ||
      url.startsWith('blob:') ||
      (isDev && /^(https?|wss?):\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url))
    cb({ cancel: !allowed })
  })

  handleAssetProtocol({
    root: () => vault.rootPath,
    resolve: (target, from) => vault.resolveAttachment(target, from)
  })

  registerIpcHandlers({
    getWindow: () => mainWindow,
    vault,
    settings,
    cacheDir,
    demoVaultPath,
    isTrustedSender,
    applyLoginItem,
    appInfo: () => ({
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      userDataPath: userDataDir,
      e2e: isE2E,
      systemReducedMotion:
        process.platform === 'darwin' ? systemPreferences.getAnimationSettings().prefersReducedMotion : false
    })
  })

  buildMenu(() => mainWindow, sendMenu, isDev)

  if (isDev && process.platform === 'darwin') {
    const icon = join(__dirname, '../../build/icon.png')
    if (existsSync(icon)) app.dock?.setIcon(icon)
  }

  createWindow()

  // Reconnect the previously selected vault (or an override used by automated tests).
  const s = settings.get()
  const override = process.env.NEXUS_VAULT
  if (override) {
    void vault.open(override, { includeTxt: s.includeTxt })
  } else if (s.demoMode) {
    void vault.open(demoVaultPath, { isDemo: true })
  } else if (s.vaultPath) {
    void vault.open(s.vaultPath, { includeTxt: s.includeTxt })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // Standard macOS behaviour: the app stays active until Command-Q.
  if (process.platform !== 'darwin' || isE2E) app.quit()
})

app.on('before-quit', () => {
  void settings.flush()
  void worker?.terminate()
})

// Harden any web contents created later (e.g. devtools are fine; nothing else should exist).
app.on('web-contents-created', (_e, contents) => {
  contents.on('will-navigate', (ev, url) => {
    if (!isTrustedUrl(url)) ev.preventDefault()
  })
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
})
