import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin } from 'vite'

const alias = {
  '@shared': resolve(__dirname, 'src/shared'),
  '@shaders': resolve(__dirname, 'src/shaders')
}

/**
 * Injects the Content Security Policy. Production builds get a strict policy
 * (no inline scripts, no remote origins). The dev server needs inline scripts
 * and a websocket for HMR, so it gets a relaxed policy limited to localhost.
 */
function contentSecurityPolicy(): Plugin {
  const strict = [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: nexus-asset:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "media-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'none'",
    "form-action 'none'"
  ].join('; ')
  const dev = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: nexus-asset:",
    "font-src 'self' data:",
    "connect-src 'self' ws://localhost:* http://localhost:*",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'"
  ].join('; ')
  let isBuild = false
  return {
    name: 'nexus-csp',
    configResolved(config) {
      isBuild = config.command === 'build'
    },
    transformIndexHtml(html) {
      const policy = isBuild ? strict : dev
      return html.replace(
        '<!--CSP-->',
        `<meta http-equiv="Content-Security-Policy" content="${policy}" />`
      )
    }
  }
}

/**
 * gray-matter ships a JavaScript front-matter engine that calls eval(). NEXUS
 * disables that engine at runtime; this also removes the code path from the
 * bundle so note content can never reach eval.
 */
function stripFrontmatterEval(): Plugin {
  return {
    name: 'nexus-strip-gray-matter-eval',
    transform(code, id) {
      if (!id.replace(/\\/g, '/').includes('gray-matter/lib/engines')) return null
      return code.replace(/eval\(str\)/g, "(function () { throw new Error('JavaScript front matter is disabled') })()")
    }
  }
}

export default defineConfig({
  main: {
    resolve: { alias },
    plugins: [stripFrontmatterEval()],
    build: {
      externalizeDeps: false,
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') },
        external: ['fsevents']
      }
    }
  },
  preload: {
    resolve: { alias },
    build: {
      externalizeDeps: false,
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: { alias },
    plugins: [react(), tailwindcss(), contentSecurityPolicy()],
    build: {
      chunkSizeWarningLimit: 4000,
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') }
      }
    }
  }
})
