/** IPC channel names. Keep in sync between main and preload. */
export const IPC = {
  getStatus: 'vault:get-status',
  getSnapshot: 'vault:get-snapshot',
  selectVault: 'vault:select',
  openDemo: 'vault:open-demo',
  reindex: 'vault:reindex',
  disconnect: 'vault:disconnect',
  getNote: 'vault:get-note',
  search: 'vault:search',
  openInObsidian: 'vault:open-in-obsidian',
  revealInFinder: 'vault:reveal-in-finder',
  openExternal: 'app:open-external',
  getSettings: 'settings:get',
  updateSettings: 'settings:update',
  clearCache: 'app:clear-cache',
  getAppInfo: 'app:get-info',
  // main → renderer events
  statusEvent: 'event:vault-status',
  snapshotEvent: 'event:vault-snapshot',
  settingsEvent: 'event:settings',
  menuEvent: 'event:menu',
  visibilityEvent: 'event:visibility'
} as const
