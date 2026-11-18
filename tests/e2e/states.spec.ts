import { test, expect } from '@playwright/test'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { hooks, launch, waitReady } from './harness'

test('first launch shows onboarding with a single primary action', async () => {
  const { app, page } = await launch()
  try {
    await expect(page.getByText('Your knowledge, visualized.')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('connect-vault')).toHaveText('Connect Obsidian Vault')
    await expect(page.getByTestId('made-by')).toHaveText('Made by Albert')
    // The credit opens the author's GitHub in the default browser.
    await app.evaluate(({ shell }) => {
      const g = globalThis as unknown as { __opened: string[] }
      g.__opened = []
      shell.openExternal = async (url: string) => {
        g.__opened.push(url)
      }
    })
    await page.getByTestId('made-by').click()
    await expect
      .poll(() => app.evaluate(() => (globalThis as unknown as { __opened: string[] }).__opened))
      .toEqual(['https://github.com/albertnuke'])
    expect(page.url()).toMatch(/^file:\/\//) // the app itself did not navigate
    expect(await hooks(page, (h) => h.starCount())).toBe(0)
    // No fake notes: the universe has no interactive stars until a vault is connected.
    expect(await hooks(page, (h) => h.state().status.kind)).toBe('none')
  } finally {
    await app.close()
  }
})

test('demo mode is clearly labelled sample data', async () => {
  const { app, page } = await launch({ demo: true })
  try {
    await waitReady(page, 69)
    await expect(page.getByText('Sample data · 69 notes')).toBeVisible()
    await expect(page.getByText('Demo', { exact: true })).toBeVisible()
    await hooks(page, (h) => (h as unknown as { openNote(id: string): void }).openNote('Astronomy/Black Holes.md'))
    await expect(page.getByTestId('note-title')).toHaveText('Black Holes')
    // Demo notes are not in an Obsidian vault, so the button is not offered.
    await expect(page.getByRole('button', { name: /Open in Obsidian/ })).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('an empty vault shows a helpful message and stars appear when notes are created', async () => {
  const dir = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'nexus-empty-')))
  const { app, page } = await launch({ vault: dir })
  try {
    await expect(page.getByText('This vault has no Markdown notes yet.')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: 'Choose another vault' })).toBeVisible()
    await fs.writeFile(join(dir, 'First.md'), '# First\n')
    await waitReady(page, 1)
    await expect(page.getByText('This vault has no Markdown notes yet.')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('a missing vault reports a meaningful error instead of crashing', async () => {
  const { app, page } = await launch({ vault: '/Volumes/Definitely-Not-Mounted/Vault' })
  try {
    await expect(page.getByText('The vault could not be opened.')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('alert')).toContainText(/could not be found|disconnected drive/)
  } finally {
    await app.close()
  }
})

test('settings persist to Application Support and change rendering flags', async () => {
  const vault = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'nexus-settings-')))
  await fs.writeFile(join(vault, 'A.md'), '# A\n[[B]]\n')
  await fs.writeFile(join(vault, 'B.md'), '# B\n')
  const { app, page, userData } = await launch({ vault })
  try {
    await waitReady(page, 2)
    await page.getByRole('button', { name: 'Hide connections' }).click()
    await expect(page.getByRole('button', { name: 'Show connections' })).toBeVisible()
    await expect
      .poll(async () => JSON.parse(await fs.readFile(join(userData, 'settings.json'), 'utf8')).showConnections, { timeout: 5000 })
      .toBe(false)
    // Settings overlay: every control is wired to real settings.
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Visual settings' }).click()
    await page.getByRole('button', { name: 'Performance' }).click()
    await expect
      .poll(async () => JSON.parse(await fs.readFile(join(userData, 'settings.json'), 'utf8')).quality, { timeout: 5000 })
      .toBe('performance')
    // Nothing was written into the vault.
    expect((await fs.readdir(vault)).sort()).toEqual(['A.md', 'B.md'])
  } finally {
    await app.close()
  }
})

test('5,000-note vaults load and stay interactive', async () => {
  test.setTimeout(180_000)
  const dir = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'nexus-big-')))
  const folders = ['Research', 'Projects', 'Reading', 'Ideas', 'Work', 'Learning', 'Archive', 'People']
  for (const f of folders) await fs.mkdir(join(dir, f))
  await Promise.all(
    Array.from({ length: 5000 }, (_, i) =>
      fs.writeFile(
        join(dir, folders[i % folders.length], `Note ${i}.md`),
        `# Note ${i}\n\nSee [[Note ${(i * 7 + 3) % 5000}]] and [[Note ${(i * 13 + 1) % 5000}]].\n`
      )
    )
  )
  const started = Date.now()
  const { app, page } = await launch({ vault: dir })
  try {
    await page.waitForFunction(() => (globalThis as unknown as { __nexusTest: { starCount(): number } }).__nexusTest.starCount() === 5000, null, {
      timeout: 90_000
    })
    const loadMs = Date.now() - started
    await page.waitForTimeout(5000) // launch sequence
    const fps = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const requestAnimationFrame = (globalThis as unknown as { requestAnimationFrame(cb: () => void): number }).requestAnimationFrame
          let frames = 0
          const start = performance.now()
          const tick = () => {
            frames++
            if (performance.now() - start < 3000) requestAnimationFrame(tick)
            else resolve((frames * 1000) / (performance.now() - start))
          }
          requestAnimationFrame(tick)
        })
    )
    console.log(`5,000 notes: first load ${loadMs} ms, ${fps.toFixed(1)} fps`)
    expect(fps).toBeGreaterThan(30)
    expect(await hooks(page, (h) => h.edgeCount())).toBeGreaterThan(5000)
  } finally {
    await app.close()
    await fs.rm(dir, { recursive: true, force: true })
  }
})
