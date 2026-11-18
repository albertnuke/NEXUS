import { parentPort } from 'node:worker_threads'
import { computeLayout, type LayoutInput } from './layoutEngine'

/** Runs the force layout off the main thread so the app stays responsive. */
parentPort?.on('message', (msg: { id: number; input: LayoutInput }) => {
  try {
    const output = computeLayout(msg.input)
    parentPort?.postMessage({ id: msg.id, output })
  } catch (err) {
    parentPort?.postMessage({ id: msg.id, error: (err as Error).message })
  }
})
