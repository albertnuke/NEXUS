import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { promises as fs, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

export const ROOT = resolve(__dirname, '../..')
export const FIXTURE_VAULT = join(ROOT, 'tests/fixtures/test-vault')
export const PACKAGED_BINARY = join(ROOT, 'release/mac-arm64/NEXUS.app/Contents/MacOS/NEXUS')
export const PACKAGED = process.env.NEXUS_TEST_PACKAGED === '1'

export interface Launched {
  app: ElectronApplication
  page: Page
  userData: string
  requests: string[]
}

/** Copies the fixture vault to a fresh temp folder so tests can change it freely. */
export async function tempVault(): Promise<string> {
  const dir = await fs.mkdtemp(join(tmpdir(), 'nexus-e2e-vault-'))
  await fs.cp(FIXTURE_VAULT, dir, { recursive: true, verbatimSymlinks: true })
  return fs.realpath(dir)
}

export async function launch(opts: { vault?: string; demo?: boolean; settings?: Record<string, unknown> } = {}): Promise<Launched> {
  const userData = await fs.mkdtemp(join(tmpdir(), 'nexus-e2e-ud-'))
  const settings = { ...(opts.settings ?? {}), ...(opts.demo ? { demoMode: true } : {}) }
  await fs.writeFile(join(userData, 'settings.json'), JSON.stringify(settings))
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    NEXUS_E2E: '1',
    NEXUS_USER_DATA_DIR: userData
  }
  delete env.ELECTRON_RENDERER_URL
  if (opts.vault) env.NEXUS_VAULT = opts.vault
  let app: ElectronApplication
  if (PACKAGED) {
    if (!existsSync(PACKAGED_BINARY)) throw new Error(`Packaged app not found at ${PACKAGED_BINARY}. Run npm run dist first.`)
    app = await electron.launch({ executablePath: PACKAGED_BINARY, env, cwd: tmpdir() })
  } else {
    app = await electron.launch({ args: [join(ROOT, 'out/main/index.js')], env, cwd: ROOT })
  }
  const page = await app.firstWindow()
  const requests: string[] = []
  page.on('request', (r) => requests.push(r.url()))
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]
    w.setSize(1440, 900)
    w.center()
  })
  await page.waitForFunction(() => !!(globalThis as unknown as { __nexusTest?: unknown }).__nexusTest)
  return { app, page, userData, requests }
}

type Hooks = {
  starCount(): number
  edgeCount(): number
  ids(): string[]
  state(): { selectedId: string | null; focusedCategory: string | null; panelOpen: boolean; overlay: string; status: { kind: string }; revision: number | null }
  camera(): { tx: number; ty: number; tz: number; azimuth: number; elevation: number; distance: number; shift: number; busy: boolean }
  noteMeta(id: string): { title: string; outgoing: string[]; headings: Array<{ text: string }> } | null
  screenPosition(id: string): [number, number] | null
  blackHoleScreen(): { x: number; y: number; radius: number }
  emphasis(id: string): number | null
  cameraTo(s: Record<string, number>, ms?: number): void
}

/** Runs `fn` against the in-page test hooks. `arg` is JSON-serialised (closures are not). */
export function hooks<T, A = undefined>(page: Page, fn: (h: Hooks, arg: A) => T, arg?: A): Promise<T> {
  return page.evaluate(`(${fn.toString()})(window.__nexusTest, ${JSON.stringify(arg ?? null)})`) as Promise<T>
}

export async function waitReady(page: Page, stars: number): Promise<void> {
  await page.waitForFunction(
    (n) => {
      const h = (globalThis as unknown as { __nexusTest: { starCount(): number; state(): { status: { kind: string } } } }).__nexusTest
      return h.state().status.kind === 'ready' && h.starCount() === n
    },
    stars,
    { timeout: 30_000 }
  )
}
