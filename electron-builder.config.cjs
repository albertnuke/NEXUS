/**
 * electron-builder configuration for NEXUS (Apple Silicon).
 *
 * Build modes:
 *   default            ad-hoc signed; the --inspect fuse stays on so the
 *                      Playwright suite can drive the packaged app.
 *   NEXUS_HARDENED=1   public download build (npm run release:github):
 *                      ad-hoc signed with every debugging fuse off.
 *   NEXUS_RELEASE=1    Developer ID signing + hardened runtime + notarization
 *                      (needs CSC_* and APPLE_* credentials, see README).
 * NEXUS_OUTPUT_DIR overrides the output folder.
 */
const release = process.env.NEXUS_RELEASE === '1'
const hardened = release || process.env.NEXUS_HARDENED === '1'

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'app.nexus.knowledgeuniverse',
  productName: 'NEXUS',
  copyright: 'Copyright © 2026 Albert. Made by Albert.',
  directories: { output: process.env.NEXUS_OUTPUT_DIR || 'release', buildResources: 'build' },
  files: ['out/**/*', 'package.json', '!**/*.map'],
  extraResources: [{ from: 'resources/demo-vault', to: 'demo-vault' }],
  asar: true,
  npmRebuild: false,
  electronLanguages: ['en'],
  mac: {
    target: [
      { target: 'dmg', arch: ['arm64'] },
      { target: 'dir', arch: ['arm64'] }
    ],
    category: 'public.app-category.productivity',
    icon: 'build/icon.icns',
    darkModeSupport: true,
    minimumSystemVersion: '12.0',
    // "-" = ad-hoc signature for local, unsigned builds. Override with CSC_NAME for a real identity.
    identity: release ? undefined : '-',
    hardenedRuntime: release,
    gatekeeperAssess: false,
    notarize: release,
    extendInfo: {
      NSDocumentsFolderUsageDescription: 'NEXUS reads the Obsidian vault you choose so it can visualise your notes. It never modifies them.',
      NSDesktopFolderUsageDescription: 'NEXUS reads the Obsidian vault you choose so it can visualise your notes. It never modifies them.',
      NSDownloadsFolderUsageDescription: 'NEXUS reads the Obsidian vault you choose so it can visualise your notes. It never modifies them.',
      NSRemovableVolumesUsageDescription: 'NEXUS reads Obsidian vaults stored on external drives when you choose one.',
      NSNetworkVolumesUsageDescription: 'NEXUS reads Obsidian vaults stored on network volumes when you choose one.',
      NSFileProviderDomainUsageDescription: 'NEXUS reads Obsidian vaults stored in cloud-synced folders when you choose one.',
      LSApplicationCategoryType: 'public.app-category.productivity'
    }
  },
  dmg: {
    title: 'NEXUS',
    artifactName: 'NEXUS.dmg',
    window: { width: 540, height: 380 },
    contents: [
      { x: 140, y: 190 },
      { x: 400, y: 190, type: 'link', path: '/Applications' }
    ]
  },
  electronFuses: {
    runAsNode: false,
    enableCookieEncryption: true,
    enableNodeOptionsEnvironmentVariable: false,
    onlyLoadAppFromAsar: true,
    // Kept enabled for local test builds so the packaged app can be driven by
    // the Playwright suite (npm run test:packaged). Public builds disable it.
    enableNodeCliInspectArguments: !hardened,
    loadBrowserProcessSpecificV8Snapshot: false
  }
}
