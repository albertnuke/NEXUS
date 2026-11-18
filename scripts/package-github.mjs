#!/usr/bin/env node
/**
 * Builds upload-ready GitHub release assets in release/github/:
 *
 *   NEXUS-<version>-arm64.dmg   drag-to-Applications installer
 *   NEXUS-<version>-arm64.zip   the same app as a zip (ditto, signature-safe)
 *   SHA256SUMS.txt              checksums for both
 *   RELEASE_NOTES.md            text for the GitHub release description
 *
 * The app is built in hardened mode (debugging fuses off) and ad-hoc signed.
 * Every artifact is verified before the script reports success.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const version = pkg.version
const buildDir = join(root, 'release', 'github-build')
const outDir = join(root, 'release', 'github')
const base = `NEXUS-${version}-arm64`

function run(cmd, args, opts = {}) {
  console.log(`\n› ${cmd} ${args.join(' ')}`)
  return execFileSync(cmd, args, { cwd: root, stdio: 'inherit', ...opts })
}
function capture(cmd, args) {
  return execFileSync(cmd, args, { cwd: root, encoding: 'utf8' })
}
function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}
function mb(file) {
  return `${(statSync(file).size / 1024 / 1024).toFixed(0)} MB`
}
function verifyApp(app, label) {
  execFileSync('codesign', ['--verify', '--deep', '--strict', app])
  const fuses = capture('npx', ['--no-install', '@electron/fuses', 'read', '--app', app])
  if (!/EnableNodeCliInspectArguments is Disabled/.test(fuses) || !/RunAsNode is Disabled/.test(fuses)) {
    throw new Error(`${label}: debugging fuses are not disabled:\n${fuses}`)
  }
  console.log(`✓ ${label}: signature valid, debugging fuses off`)
}

// 1. Build the hardened app + DMG.
run('npm', ['run', 'build'])
rmSync(buildDir, { recursive: true, force: true })
run('npx', ['electron-builder', '--config', 'electron-builder.config.cjs', '--mac', '--arm64', '--publish', 'never'], {
  env: { ...process.env, NEXUS_HARDENED: '1', NEXUS_OUTPUT_DIR: buildDir }
})
const app = join(buildDir, 'mac-arm64', 'NEXUS.app')
const builtDmg = join(buildDir, 'NEXUS.dmg')
if (!existsSync(app) || !existsSync(builtDmg)) throw new Error('electron-builder did not produce NEXUS.app and NEXUS.dmg')
verifyApp(app, 'NEXUS.app')

// 2. Assemble the upload folder.
rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })
const dmg = join(outDir, `${base}.dmg`)
const zip = join(outDir, `${base}.zip`)
copyFileSync(builtDmg, dmg)
// ditto preserves the bundle's symlinks and signature (plain `zip` would break them).
execFileSync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, zip])

// 3. Verify both artifacts as a downloader would receive them.
execFileSync('hdiutil', ['verify', dmg], { stdio: 'ignore' })
const mount = mkdtempSync(join(tmpdir(), 'nexus-dmg-'))
execFileSync('hdiutil', ['attach', dmg, '-nobrowse', '-readonly', '-mountpoint', mount], { stdio: 'ignore' })
try {
  if (!existsSync(join(mount, 'Applications'))) throw new Error('DMG is missing the Applications shortcut')
  verifyApp(join(mount, 'NEXUS.app'), `${base}.dmg`)
} finally {
  execFileSync('hdiutil', ['detach', mount], { stdio: 'ignore' })
}
const unzipped = mkdtempSync(join(tmpdir(), 'nexus-zip-'))
execFileSync('ditto', ['-x', '-k', zip, unzipped])
verifyApp(join(unzipped, 'NEXUS.app'), `${base}.zip`)
rmSync(unzipped, { recursive: true, force: true })

// 4. Checksums and release notes.
const sums = [dmg, zip].map((f) => `${sha256(f)}  ${f.slice(outDir.length + 1)}`).join('\n') + '\n'
writeFileSync(join(outDir, 'SHA256SUMS.txt'), sums)

const notes = `# NEXUS ${version}

**Your Obsidian vault as a cinematic, explorable universe.** Every note is a star, every link a hairline connection, folders become constellations, and a ray-traced black hole sits at the centre.

## Download

| File | Size | Use it for |
|---|---|---|
| \`${base}.dmg\` | ${mb(dmg)} | Recommended. Open it and drag NEXUS to Applications |
| \`${base}.zip\` | ${mb(zip)} | The same app as a zip archive |

**Requirements:** macOS 12 or later on Apple Silicon (M1 or newer). Intel Macs are not supported in this release.

## Install

1. Open \`${base}.dmg\` and drag **NEXUS** into **Applications**.
2. Open NEXUS. This build is not notarized by Apple, so the first launch is blocked with a message that Apple could not verify it.
3. Go to **System Settings → Privacy & Security**, scroll to *Security*, and click **Open Anyway** next to the NEXUS message. Confirm with your password or Touch ID. You only need to do this once.

If you are comfortable with Terminal, you can instead clear the download quarantine flag:

\`\`\`bash
xattr -dr com.apple.quarantine /Applications/NEXUS.app
\`\`\`

## What's inside

- One star per Markdown note, connected by your real \`[[wikilinks]]\` and Markdown links. Folders become constellations, and the layout stays stable between launches.
- Live updates as you create, edit, rename and delete notes in Obsidian.
- A note panel with rendered Markdown, links and backlinks. Double-click a star to open it in Obsidian.
- ⌘K search across titles, headings, tags, links and content.
- A Home dashboard computed from your own vault.
- High / Balanced / Performance quality presets, plus support for macOS Reduce Motion.
- A demo universe of clearly labelled sample notes, so you can try it without a vault.

## Privacy

NEXUS works entirely offline. There is no telemetry and no account, and it makes no network requests. It reads your vault without ever modifying it, and keeps its settings and layout cache in \`~/Library/Application Support/NEXUS\`.

## Verify your download

\`\`\`text
${sums.trim()}
\`\`\`

\`\`\`bash
shasum -a 256 ${base}.dmg
\`\`\`

---

Made by [Albert](https://github.com/albertnuke).
`
writeFileSync(join(outDir, 'RELEASE_NOTES.md'), notes)

console.log(`\n✓ GitHub release assets ready in ${outDir}`)
console.log(sums)
