#!/usr/bin/env node
/**
 * Renders the NEXUS app icon procedurally (no external assets): a tiny
 * black hole with a lensed accretion disk and a few connected stars on a
 * macOS-style rounded square. Outputs build/icon.png (1024²) and, on macOS,
 * build/icon.icns via sips + iconutil.
 */
import { PNG } from 'pngjs'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'build')
mkdirSync(out, { recursive: true })

const S = 1024
const C = 512
const HALF = 412 // squircle half-size (824px body, Big Sur grid)
const SS = 3 // supersampling

const gold = [0.957, 0.78, 0.478]
const hot = [1.0, 0.95, 0.86]
const orange = [0.86, 0.46, 0.17]

function hash(n) {
  const x = Math.sin(n * 127.1) * 43758.5453
  return x - Math.floor(x)
}
function noise1(x) {
  const i = Math.floor(x)
  const f = x - i
  const u = f * f * (3 - 2 * f)
  return hash(i) * (1 - u) + hash(i + 1) * u
}

const stars = Array.from({ length: 26 }, (_, i) => {
  const a = hash(i + 1) * Math.PI * 2
  const r = 190 + hash(i + 7) * 190
  return { x: C + Math.cos(a) * r, y: C + Math.sin(a) * r * 0.78, s: 1.6 + hash(i + 13) * 2.8, b: 0.5 + hash(i + 21) * 0.5 }
}).filter((s) => Math.abs(s.y - C) > 40)
const links = []
for (let i = 0; i < stars.length; i++) {
  let best = -1
  let bd = Infinity
  for (let j = 0; j < stars.length; j++) {
    if (i === j) continue
    const d = Math.hypot(stars[i].x - stars[j].x, stars[i].y - stars[j].y)
    if (d < bd) {
      bd = d
      best = j
    }
  }
  if (best >= 0 && bd < 190) links.push([stars[i], stars[best]])
}

function segDist(px, py, a, b) {
  const vx = b.x - a.x
  const vy = b.y - a.y
  const t = Math.max(0, Math.min(1, ((px - a.x) * vx + (py - a.y) * vy) / (vx * vx + vy * vy)))
  return Math.hypot(px - (a.x + vx * t), py - (a.y + vy * t))
}

function shade(x, y) {
  const dx = x - C
  const dy = y - C
  const sq = Math.pow(Math.abs(dx) / HALF, 5) + Math.pow(Math.abs(dy) / HALF, 5)
  if (sq > 1) return null
  const d = Math.hypot(dx, dy)
  // Background: near-black with a faint charcoal vignette.
  const t = Math.min(1, d / 560)
  let col = [0.05 - 0.035 * t, 0.05 - 0.035 * t, 0.06 - 0.04 * t]
  const add = (c, k) => {
    col[0] += c[0] * k
    col[1] += c[1] * k
    col[2] += c[2] * k
  }
  // Warm glow.
  add(gold, Math.exp(-d / 120) * 0.42)
  // Connections and stars.
  for (const [a, b] of links) add([0.85, 0.84, 0.8], Math.exp(-Math.pow(segDist(x, y, a, b) / 1.1, 2)) * 0.16)
  for (const s of stars) {
    const sd = Math.hypot(x - s.x, y - s.y)
    add([1, 0.98, 0.93], (Math.exp(-Math.pow(sd / s.s, 2)) * 1.4 + Math.exp(-sd / (s.s * 2.5)) * 0.18) * s.b)
  }
  const RS = 92
  const ang = Math.atan2(dy, dx)
  // Back of the disk lensed over the top and under the bottom of the shadow.
  const tex = 0.8 + 0.4 * noise1((ang + Math.PI) * 14 + d * 0.05)
  const top = Math.max(0, -dy / Math.max(d, 1))
  const arc = Math.exp(-Math.pow((d - RS * 1.24) / 9, 2)) * (0.35 + 0.95 * top) * tex
  add(gold, arc * 1.5)
  add(gold, Math.exp(-Math.pow((d - RS * 1.24) / 26, 2)) * 0.12)
  add(hot, Math.exp(-Math.pow((d - RS * 1.06) / 3.2, 2)) * 1.6)
  // Shadow.
  const inShadow = d < RS
  if (inShadow) col = col.map((v) => v * 0.04)
  // Disk plane (front half crosses the shadow).
  const e = Math.hypot(dx, dy / 0.14)
  if (e > RS * 1.15 && e < 360) {
    const prof = Math.pow((RS * 1.15) / e, 1.3) * (1 - Math.pow(e / 360, 3))
    const swirl = 0.7 + 0.6 * noise1(e * 0.09 + ang * 2.0)
    const doppler = dx < 0 ? 1.35 : 0.85
    if (!inShadow) add(e < 170 ? hot : gold, prof * swirl * doppler * 1.25)
  }
  // Thin luminous horizontal structure.
  const band = Math.exp(-Math.pow(dy / 3.4, 2)) * Math.exp(-Math.abs(dx) / (dx < 0 ? 300 : 230))
  add(Math.abs(dx) < 160 ? hot : orange, band * 2.2)
  add(orange, Math.exp(-Math.abs(dy) / 14) * Math.exp(-Math.abs(dx) / 240) * 0.18)
  // Filmic tone curve, then the squircle's soft inner edge.
  col = col.map((v) => 1 - Math.exp(-Math.max(0, v) * 1.25))
  const edge = Math.min(1, (1 - sq) * 40)
  return [col[0], col[1], col[2], edge]
}

const png = new PNG({ width: S, height: S })
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    let r = 0
    let g = 0
    let b = 0
    let a = 0
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const c = shade(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS)
        if (!c) continue
        r += c[0] * c[3]
        g += c[1] * c[3]
        b += c[2] * c[3]
        a += c[3]
      }
    }
    const n = SS * SS
    const i = (y * S + x) * 4
    const alpha = a / n
    png.data[i] = alpha ? Math.round(Math.min(1, r / a) * 255) : 0
    png.data[i + 1] = alpha ? Math.round(Math.min(1, g / a) * 255) : 0
    png.data[i + 2] = alpha ? Math.round(Math.min(1, b / a) * 255) : 0
    png.data[i + 3] = Math.round(alpha * 255)
  }
}
const pngPath = join(out, 'icon.png')
writeFileSync(pngPath, PNG.sync.write(png))
console.log(`wrote ${pngPath}`)

if (process.platform === 'darwin') {
  const iconset = join(out, 'icon.iconset')
  rmSync(iconset, { recursive: true, force: true })
  mkdirSync(iconset)
  for (const size of [16, 32, 128, 256, 512]) {
    execFileSync('sips', ['-z', String(size), String(size), pngPath, '--out', join(iconset, `icon_${size}x${size}.png`)], { stdio: 'ignore' })
    execFileSync('sips', ['-z', String(size * 2), String(size * 2), pngPath, '--out', join(iconset, `icon_${size}x${size}@2x.png`)], { stdio: 'ignore' })
  }
  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', join(out, 'icon.icns')])
  rmSync(iconset, { recursive: true, force: true })
  console.log(`wrote ${join(out, 'icon.icns')}`)
}
