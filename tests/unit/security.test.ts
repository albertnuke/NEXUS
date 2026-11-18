import { describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import { resolveVaultFile } from '../../src/main/filesystem/pathGuard'
import { buildObsidianUri } from '../../src/main/electron/obsidian'
import { isNoteId, isSafeExternalUrl, sanitizeSettingsPatch, normalizeStoredSettings } from '../../src/shared/validation'
import { FIXTURE_VAULT } from './helpers'

describe('path guard', () => {
  it('allows files inside the vault', async () => {
    const root = await fs.realpath(FIXTURE_VAULT)
    await expect(resolveVaultFile(root, 'Welcome.md')).resolves.toBe(`${root}/Welcome.md`)
  })

  it('rejects traversal, absolute paths and symlinks', async () => {
    const root = await fs.realpath(FIXTURE_VAULT)
    await expect(resolveVaultFile(root, '../outside-secret.md')).rejects.toThrow()
    await expect(resolveVaultFile(root, '/etc/passwd')).rejects.toThrow()
    await expect(resolveVaultFile(root, 'Personal/../../outside-secret.md')).rejects.toThrow()
    await expect(resolveVaultFile(root, 'Personal/Linked Secret.md')).rejects.toThrow(/Symbolic/)
    await expect(resolveVaultFile(root, 'Cybersecurity')).rejects.toThrow()
  })
})

describe('validation', () => {
  it('validates note ids', () => {
    expect(isNoteId('a/b.md')).toBe(true)
    expect(isNoteId('../a.md')).toBe(false)
    expect(isNoteId('a//b.md')).toBe(false)
    expect(isNoteId('/abs.md')).toBe(false)
    expect(isNoteId('a\0.md')).toBe(false)
    expect(isNoteId(42)).toBe(false)
  })

  it('sanitizes settings patches and never lets the renderer set vault paths', () => {
    const patch = sanitizeSettingsPatch({ quality: 'ultra', starBrightness: 99, vaultPath: '/etc', demoMode: true, showConnections: false })
    expect(patch).toEqual({ starBrightness: 2.5, showConnections: false })
    const stored = normalizeStoredSettings({ quality: 'balanced', vaultPath: '/Users/x/Vault' })
    expect(stored.quality).toBe('balanced')
    expect(stored.vaultPath).toBe('/Users/x/Vault')
  })

  it('only opens safe external URLs', () => {
    expect(isSafeExternalUrl('https://obsidian.md')).toBe(true)
    expect(isSafeExternalUrl('mailto:a@b.c')).toBe(true)
    expect(isSafeExternalUrl('file:///etc/passwd')).toBe(false)
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false)
  })
})

describe('Obsidian URI', () => {
  it('encodes the absolute note path', () => {
    const uri = buildObsidianUri('/Users/me/My Vault', 'Folder/Café & Co #1.md', 'current')
    expect(uri).toBe(`obsidian://open?path=${encodeURIComponent('/Users/me/My Vault/Folder/Café & Co #1.md')}`)
    expect(decodeURIComponent(uri.split('path=')[1])).toBe('/Users/me/My Vault/Folder/Café & Co #1.md')
  })

  it('can open in a new tab', () => {
    expect(buildObsidianUri('/v', 'a.md', 'tab')).toMatch(/&paneType=tab$/)
  })
})
