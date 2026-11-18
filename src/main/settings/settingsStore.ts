import { promises as fs, readFileSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import type { ApplicationSettings } from '@shared/types'
import { normalizeStoredSettings } from '@shared/validation'

/**
 * JSON settings persisted to ~/Library/Application Support/NEXUS/settings.json.
 * Writes are atomic (temp file + rename) and serialised.
 */
export class SettingsStore extends EventEmitter<{ change: [ApplicationSettings] }> {
  private settings: ApplicationSettings
  private readonly file: string
  private chain: Promise<void> = Promise.resolve()

  constructor(dir: string) {
    super()
    this.file = join(dir, 'settings.json')
    let stored: unknown = null
    try {
      stored = JSON.parse(readFileSync(this.file, 'utf8'))
    } catch {
      stored = null
    }
    this.settings = normalizeStoredSettings(stored)
  }

  get(): ApplicationSettings {
    return structuredClone(this.settings)
  }

  update(patch: Partial<ApplicationSettings>): ApplicationSettings {
    this.settings = {
      ...this.settings,
      ...patch,
      camera: { ...this.settings.camera, ...(patch.camera ?? {}) }
    }
    this.persist()
    this.emit('change', this.get())
    return this.get()
  }

  private persist(): void {
    const data = JSON.stringify(this.settings, null, 2)
    this.chain = this.chain
      .then(async () => {
        const dir = join(this.file, '..')
        await fs.mkdir(dir, { recursive: true })
        const tmp = `${this.file}.tmp`
        await fs.writeFile(tmp, data, 'utf8')
        await fs.rename(tmp, this.file)
      })
      .catch(() => undefined)
  }

  flush(): Promise<void> {
    return this.chain
  }
}
