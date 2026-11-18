import type { NexusApi } from '../../../preload/index'

/** Typed access to the preload bridge (`contextBridge.exposeInMainWorld('nexus', …)`). */
export const nexus: NexusApi = (window as unknown as { nexus: NexusApi }).nexus
