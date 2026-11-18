import { test, expect } from '@playwright/test'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { hashTree } from '../unit/helpers'
import { hooks, launch, tempVault, waitReady, PACKAGED, type Launched } from './harness'

const EXPECTED_IDS = [
  'Cybersecurity/Category Override.md',
  'Cybersecurity/Encryption.md',
  'Cybersecurity/Firewalls.md',
  'Cybersecurity/Network Security.md',
  'Personal/Duplicate.md',
  'Personal/Isolated.md',
  'Personal/Journal/2024-01-01.md',
  'Personal/Unicode Café.md',
  'Programming/Duplicate.md',
  'Programming/Python Basics.md',
  'Programming/Similar Names.md',
  'Programming/Table Note.md',
  'Welcome.md'
]

let ctx: Launched
let vault: string
let vaultHashes: Record<string, string>

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  vault = await tempVault()
  vaultHashes = await hashTree(vault)
  ctx = await launch({ vault })
  await waitReady(ctx.page, 13)
  // Let the launch sequence finish so stars are fully visible and clickable.
  await ctx.page.waitForTimeout(4500)
})

test.afterAll(async () => {
  await ctx?.app.close()
})

async function clickableStar(id: string): Promise<[number, number]> {
  const { page } = ctx
  // Dismiss the briefing so it cannot sit on top of a star.
  await page.mouse.move(720, 450)
  await page.mouse.wheel(0, 1)
  await page.waitForTimeout(600)
  const pos = await hooks(page, (h, i) => h.screenPosition(i), id)
  expect(pos, `star for ${id} should be on screen`).not.toBeNull()
  return pos!
}

test('the production build loads from disk, not a dev server', async () => {
  expect(ctx.page.url()).toMatch(/^file:\/\//)
  if (PACKAGED) expect(ctx.page.url()).toContain('NEXUS.app/Contents/Resources/app.asar')
})

test('every Markdown note creates exactly one interactive star', async () => {
  const ids = await hooks(ctx.page, (h) => h.ids())
  expect([...ids].sort()).toEqual(EXPECTED_IDS)
  expect(new Set(ids).size).toBe(ids.length)
})

test('every valid internal link creates the expected connection; unlinked notes remain', async () => {
  expect(await hooks(ctx.page, (h) => h.edgeCount())).toBe(12)
  expect(await hooks(ctx.page, (h) => h.screenPosition('Personal/Isolated.md'))).not.toBeUndefined()
  const iso = await hooks(ctx.page, (h) => h.noteMeta('Personal/Isolated.md'))
  expect(iso?.outgoing).toEqual([])
})

test('clicking a star selects it and opens the correct note', async () => {
  const { page } = ctx
  const id = 'Cybersecurity/Network Security.md'
  const [x, y] = await clickableStar(id)
  await page.mouse.move(x, y)
  await page.waitForTimeout(250)
  await expect(page.getByRole('tooltip')).toContainText('Network Security')
  await page.mouse.click(x, y)
  await expect.poll(() => hooks(page, (h) => h.state().selectedId)).toBe(id)
  await expect(page.getByTestId('note-title')).toHaveText('Network Security')
  await expect(page.getByTestId('note-article')).toContainText('Relative markdown link')
  // Connected notes are emphasised, unrelated ones dimmed.
  expect(await hooks(page, (h) => h.emphasis('Cybersecurity/Firewalls.md'))).toBeGreaterThan(1)
  expect(await hooks(page, (h) => h.emphasis('Personal/Isolated.md'))).toBeLessThan(0.5)
})

test('the black hole stays visible beside the note panel', async () => {
  const { page } = ctx
  await page.waitForTimeout(1400)
  const bh = await hooks(page, (h) => h.blackHoleScreen())
  const panel = await page.getByTestId('note-panel').boundingBox()
  expect(panel).not.toBeNull()
  expect(bh.x + bh.radius).toBeLessThan(panel!.x)
  expect(bh.x).toBeGreaterThan(0)
  const png = PNG.sync.read(await page.screenshot())
  const scale = png.width / 1440
  // Sample a ring around the event horizon — it must be bright.
  let bright = 0
  for (let a = 0; a < 24; a++) {
    const px = Math.round((bh.x + Math.cos((a / 24) * Math.PI * 2) * bh.radius * 0.95) * scale)
    const py = Math.round((bh.y + Math.sin((a / 24) * Math.PI * 2) * bh.radius * 0.95) * scale)
    const i = (py * png.width + px) * 4
    bright = Math.max(bright, png.data[i] + png.data[i + 1] + png.data[i + 2])
  }
  expect(bright).toBeGreaterThan(300)
})

test('internal links in the note panel navigate within the universe', async () => {
  const { page } = ctx
  await page.getByTestId('note-article').getByRole('link', { name: 'Python' }).first().click()
  await expect.poll(() => hooks(page, (h) => h.state().selectedId)).toBe('Programming/Python Basics.md')
})

test('Open in Obsidian targets the correct file', async () => {
  const { app, page } = ctx
  await app.evaluate(({ shell }) => {
    const g = globalThis as unknown as { __opened: string[] }
    g.__opened = []
    shell.openExternal = async (url: string) => {
      g.__opened.push(url)
    }
  })
  await page.getByRole('button', { name: /Open in Obsidian/ }).click()
  const opened = await app.evaluate(() => (globalThis as unknown as { __opened: string[] }).__opened)
  expect(opened).toHaveLength(1)
  const url = new URL(opened[0])
  expect(url.protocol).toBe('obsidian:')
  expect(url.searchParams.get('path')).toBe(join(vault, 'Programming', 'Python Basics.md'))
})

test('double-clicking a star opens it in Obsidian', async () => {
  const { app, page } = ctx
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(1300)
  const [x, y] = await clickableStar('Cybersecurity/Encryption.md')
  await page.mouse.dblclick(x, y)
  await page.waitForTimeout(300)
  const opened = await app.evaluate(() => (globalThis as unknown as { __opened: string[] }).__opened)
  expect(decodeURIComponent(opened.at(-1)!)).toContain(join(vault, 'Cybersecurity', 'Encryption.md'))
})

test('⌘K search finds notes and Return focuses the result', async () => {
  const { page } = ctx
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Meta+k')
  const input = page.getByRole('combobox').or(page.getByLabel('Search the vault'))
  await expect(input.first()).toBeFocused()
  await page.keyboard.type('asymmetric ciphers')
  await expect(page.getByRole('option').first()).toContainText('Encryption')
  await page.keyboard.press('Enter')
  await expect.poll(() => hooks(page, (h) => h.state().selectedId)).toBe('Cybersecurity/Encryption.md')
  await expect(page.getByTestId('note-title')).toHaveText('Encryption')
  // Arrow keys move through results; Escape closes.
  await page.keyboard.press('Meta+k')
  await page.keyboard.type('duplicate')
  // Two notes are titled Duplicate; two more link to one of them.
  await expect(page.getByRole('option')).toHaveCount(4)
  await expect(page.getByRole('option').nth(0)).toContainText('Duplicate')
  await expect(page.getByRole('option').nth(1)).toContainText('Duplicate')
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('option').nth(1)).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('option')).toHaveCount(0)
})

test('selecting a category triggers a smooth camera transition', async () => {
  const { page } = ctx
  for (let i = 0; i < 3; i++) await page.keyboard.press('Escape')
  await page.waitForTimeout(1400)
  const before = await hooks(page, (h) => h.camera())
  await page.getByRole('button', { name: /Explore Programming/ }).click({ force: true })
  const samples: number[] = []
  for (let i = 0; i < 8; i++) {
    samples.push((await hooks(page, (h) => h.camera())).azimuth)
    await page.waitForTimeout(110)
  }
  await page.waitForTimeout(900)
  const after = await hooks(page, (h) => h.camera())
  expect(await hooks(page, (h) => h.state().focusedCategory)).toBe('Programming')
  expect(after.busy).toBe(false)
  expect(Math.abs(after.azimuth - before.azimuth) + Math.abs(after.distance - before.distance)).toBeGreaterThan(0.05)
  // Intermediate frames exist: the camera interpolates rather than jumping.
  const distinct = new Set(samples.map((s) => s.toFixed(4)))
  expect(distinct.size).toBeGreaterThan(3)
  await expect(page.getByRole('button', { name: /Back to the universe from Programming/ })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect.poll(() => hooks(page, (h) => h.state().focusedCategory)).toBeNull()
})

test('the Home dashboard shows real vault statistics', async () => {
  const { page } = ctx
  await page.getByRole('button', { name: 'Home', exact: true }).click()
  const dash = page.getByTestId('home-dashboard')
  await expect(dash).toBeVisible()
  await page.waitForTimeout(1600)
  await expect(page.getByTestId('stat-value-0')).toHaveText('13') // notes
  await expect(page.getByTestId('stat-value-1')).toHaveText('15') // headings
  await expect(page.getByTestId('stat-value-2')).toHaveText('14') // resolved internal links
  await expect(dash).toContainText('Most Connected Pages')
  await expect(dash).toContainText('Network Security')
  await expect(dash.getByTestId('made-by')).toHaveText('Made by Albert')
  await dash.getByTestId('made-by').click()
  await expect
    .poll(async () => (await ctx.app.evaluate(() => (globalThis as unknown as { __opened: string[] }).__opened)).at(-1))
    .toBe('https://github.com/albertnuke')
  await expect(dash).toBeVisible()
  // The universe keeps rendering behind the translucent dashboard.
  const bh = await hooks(page, (h) => h.blackHoleScreen())
  expect(bh.radius).toBeGreaterThan(5)
  await page.keyboard.press('Escape')
  await expect(dash).toBeHidden()
})

test('creating, modifying and deleting notes updates the universe live', async () => {
  const { page } = ctx
  const file = join(vault, 'Programming', 'Live Note.md')
  await fs.writeFile(file, '# Live Note\n\nLinks to [[Python Basics]].\n')
  await expect.poll(() => hooks(page, (h) => h.starCount()), { timeout: 15_000 }).toBe(14)
  expect(await hooks(page, (h) => h.edgeCount())).toBe(13)

  await fs.writeFile(file, '# Live Note Revised\n\nNow links to [[Encryption]] and [[Firewalls]].\n')
  await expect
    .poll(() => hooks(page, (h) => h.noteMeta('Programming/Live Note.md')?.headings[0]?.text), { timeout: 15_000 })
    .toBe('Live Note Revised')
  expect(await hooks(page, (h) => h.edgeCount())).toBe(14)

  await fs.rm(file)
  await expect.poll(() => hooks(page, (h) => h.starCount()), { timeout: 15_000 }).toBe(13)
  expect(await hooks(page, (h) => h.edgeCount())).toBe(12)
})

test('the app works offline: only local resources are requested', async () => {
  const offending = ctx.requests.filter((u) => !/^(file:|data:|blob:|nexus-asset:|devtools:)/.test(u))
  expect(offending).toEqual([])
})

test('the vault is never modified by indexing or visualisation', async () => {
  // The live-update test created and removed a file; everything else must be byte-identical.
  expect(await hashTree(vault)).toEqual(vaultHashes)
})
