import { app, Menu, shell, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import type { MenuCommand } from '@shared/types'

/**
 * Native macOS menu bar. Note that Command-R refreshes the vault index (it
 * does not reload the window) and Command-0 resets the camera.
 */
export function buildMenu(
  getWindow: () => BrowserWindow | null,
  send: (cmd: MenuCommand) => void,
  isDev: boolean
): void {
  const cmd = (command: MenuCommand) => () => send(command)
  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about', label: 'About NEXUS' },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'Command+,', click: cmd('settings') },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide', label: 'Hide NEXUS' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit', label: 'Quit NEXUS' }
      ]
    },
    {
      label: 'File',
      submenu: [
        { label: 'Open Vault…', accelerator: 'Command+O', click: cmd('open-vault') },
        { label: 'Refresh Vault Index', accelerator: 'Command+R', click: cmd('refresh-index') },
        { type: 'separator' },
        { role: 'close' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        { label: 'Search…', accelerator: 'Command+K', click: cmd('search') },
        { label: 'Find…', accelerator: 'Command+F', click: cmd('search') }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Home Dashboard', accelerator: 'Command+1', click: cmd('home') },
        { label: 'Pages', accelerator: 'Command+2', click: cmd('pages') },
        { type: 'separator' },
        { label: 'Zoom In', accelerator: 'Command+=', click: cmd('zoom-in') },
        { label: 'Zoom Out', accelerator: 'Command+-', click: cmd('zoom-out') },
        { label: 'Reset Camera', accelerator: 'Command+0', click: cmd('reset-camera') },
        { label: 'Toggle Connections', accelerator: 'Command+L', click: cmd('toggle-connections') },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(isDev
          ? ([
              { type: 'separator' },
              { label: 'Reload Window', accelerator: 'Command+Shift+R', click: () => getWindow()?.webContents.reload() },
              { role: 'toggleDevTools' }
            ] as MenuItemConstructorOptions[])
          : [])
      ]
    },
    {
      role: 'window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }]
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Obsidian URI Documentation',
          click: () => void shell.openExternal('https://help.obsidian.md/Extending+Obsidian/Obsidian+URI')
        }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
