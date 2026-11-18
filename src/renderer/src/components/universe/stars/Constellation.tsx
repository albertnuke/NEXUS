import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  LineSegments,
  Points,
  ShaderMaterial,
  Sphere,
  Vector3
} from 'three'
import starVert from '@shaders/particles/stars.vert.glsl?raw'
import starFrag from '@shaders/particles/stars.frag.glsl?raw'
import edgeVert from '@shaders/particles/edges.vert.glsl?raw'
import edgeFrag from '@shaders/particles/edges.frag.glsl?raw'
import hlVert from '@shaders/particles/highlight.vert.glsl?raw'
import hlFrag from '@shaders/particles/highlight.frag.glsl?raw'
import { graphModel } from '../../../lib/graphModel'
import { runtime, shared } from '../shared'
import { useStore } from '../../../state/store'

const BIG_SPHERE = new Sphere(new Vector3(), 4000)

type GeometryHolder = { geometry: BufferGeometry }
const hold = (o: Points | LineSegments | null): GeometryHolder | null => o as unknown as GeometryHolder | null

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1)
  return t * t * (3 - 2 * t)
}

function starMaterial(side: number): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: starVert,
    fragmentShader: starFrag,
    uniforms: {
      uTime: shared.uTime,
      uPixelRatio: shared.uPixelRatio,
      uBrightness: { value: 1 },
      uIntro: shared.uIntro,
      uIntroOn: shared.uIntroOn,
      uMotion: shared.uMotion,
      uBHViewZ: shared.uBHViewZ,
      uBHNdc: shared.uBHNdc,
      uBHNdcRadius: shared.uBHNdcRadius,
      uAspect: shared.uAspect,
      uSide: { value: side }
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: AdditiveBlending
  })
}

function edgeMaterial(side: number): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: edgeVert,
    fragmentShader: edgeFrag,
    uniforms: {
      uTime: shared.uTime,
      uMotion: shared.uMotion,
      uOpacity: { value: 0 },
      uSide: { value: side },
      uBHViewZ: shared.uBHViewZ,
      uColor: { value: new Color(0.34, 0.335, 0.325) }
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: AdditiveBlending
  })
}

function highlightMaterial(side: number, color: Color, strength: number): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: hlVert,
    fragmentShader: hlFrag,
    uniforms: {
      uTime: shared.uTime,
      uMotion: shared.uMotion,
      uProgress: { value: 0 },
      uStrength: { value: strength },
      uColor: { value: color },
      uSide: { value: side },
      uBHViewZ: shared.uBHViewZ
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: AdditiveBlending
  })
}

/** Builds a line geometry radiating from `source` to all its neighbours. */
class RadiatingEdges {
  geometry = new BufferGeometry()
  source = -1
  targets: number[] = []
  private positions = new Float32Array(0)
  started = 0

  set(source: number, now: number): void {
    this.source = source
    this.targets = source >= 0 ? graphModel.neighbors(source) : []
    const m = this.targets.length
    this.positions = new Float32Array(m * 6)
    const t = new Float32Array(m * 2)
    for (let k = 0; k < m; k++) t[k * 2 + 1] = 1
    this.geometry.dispose()
    this.geometry = new BufferGeometry()
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3).setUsage(DynamicDrawUsage))
    this.geometry.setAttribute('aT', new BufferAttribute(t, 1))
    this.geometry.boundingSphere = BIG_SPHERE
    this.started = now
    this.update()
  }

  update(): void {
    const s = this.source
    if (s < 0 || s >= graphModel.count) return
    const p = graphModel.pos
    for (let k = 0; k < this.targets.length; k++) {
      const o = this.targets[k]
      this.positions.set([p[s * 3], p[s * 3 + 1], p[s * 3 + 2], p[o * 3], p[o * 3 + 1], p[o * 3 + 2]], k * 6)
    }
    const attr = this.geometry.getAttribute('position') as BufferAttribute | undefined
    if (attr) attr.needsUpdate = true
  }
}

/**
 * Knowledge stars and their connections. Each pass is drawn twice — once
 * behind the black hole and once in front — so the event horizon correctly
 * hides what lies behind it while stars in front remain visible.
 */
export function Constellation() {
  const version = useStore((s) => s.snapshot?.revision ?? 0)
  const selectedId = useStore((s) => s.selectedId)
  const hoveredId = useStore((s) => s.hoveredId)
  const refs = useRef<Record<string, GeometryHolder | null>>({})

  const materials = useMemo(() => {
    const selColor = new Color(1.0, 0.86, 0.62)
    const hovColor = new Color(0.9, 0.89, 0.86)
    return {
      starsBack: starMaterial(-1),
      starsFront: starMaterial(1),
      edgesBack: edgeMaterial(-1),
      edgesFront: edgeMaterial(1),
      selBack: highlightMaterial(-1, selColor, 1),
      selFront: highlightMaterial(1, selColor, 1),
      hovBack: highlightMaterial(-1, hovColor, 0.45),
      hovFront: highlightMaterial(1, hovColor, 0.45)
    }
  }, [])

  const radiating = useMemo(() => ({ sel: new RadiatingEdges(), hov: new RadiatingEdges() }), [])

  // (Re)build GPU buffers whenever the graph structure changes.
  const geometries = useMemo(() => {
    const m = graphModel
    const stars = new BufferGeometry()
    stars.setAttribute('position', new BufferAttribute(m.pos, 3).setUsage(DynamicDrawUsage))
    stars.setAttribute('aSize', new BufferAttribute(m.size, 1))
    stars.setAttribute('aBright', new BufferAttribute(m.bright, 1))
    stars.setAttribute('aEmph', new BufferAttribute(m.emph, 1).setUsage(DynamicDrawUsage))
    stars.setAttribute('aHover', new BufferAttribute(m.hover, 1).setUsage(DynamicDrawUsage))
    stars.setAttribute('aPhase', new BufferAttribute(m.phase, 1))
    stars.setAttribute('aBirth', new BufferAttribute(m.birth, 1))
    stars.setAttribute('aWarm', new BufferAttribute(m.warm, 1))
    stars.boundingSphere = BIG_SPHERE
    const edges = new BufferGeometry()
    edges.setAttribute('position', new BufferAttribute(m.edgePos, 3).setUsage(DynamicDrawUsage))
    edges.setAttribute('aAlpha', new BufferAttribute(m.edgeAlpha, 1).setUsage(DynamicDrawUsage))
    edges.setAttribute('aPhase', new BufferAttribute(m.edgePhase, 1))
    edges.boundingSphere = BIG_SPHERE
    return { stars, edges }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version])

  useEffect(() => () => {
    geometries.stars.dispose()
    geometries.edges.dispose()
  }, [geometries])

  useEffect(() => () => Object.values(materials).forEach((mat) => mat.dispose()), [materials])

  // Selection / hover radiating edges.
  useEffect(() => {
    const idx = selectedId ? (graphModel.index.get(selectedId) ?? -1) : -1
    radiating.sel.set(idx, performance.now())
    const r = refs.current
    if (r.selBack) r.selBack.geometry = radiating.sel.geometry
    if (r.selFront) r.selFront.geometry = radiating.sel.geometry
  }, [selectedId, version, radiating])

  useEffect(() => {
    const idx = hoveredId && hoveredId !== selectedId ? (graphModel.index.get(hoveredId) ?? -1) : -1
    radiating.hov.set(idx, performance.now())
    const r = refs.current
    if (r.hovBack) r.hovBack.geometry = radiating.hov.geometry
    if (r.hovFront) r.hovFront.geometry = radiating.hov.geometry
    graphModel.setHover(hoveredId ? (graphModel.index.get(hoveredId) ?? null) : null)
  }, [hoveredId, selectedId, version, radiating])

  useFrame((_state, delta) => {
    const m = graphModel
    const dt = Math.min(delta, 0.1)
    const flags = m.step(dt)
    const g = geometries
    if (flags.pos) {
      ;(g.stars.getAttribute('position') as BufferAttribute).needsUpdate = true
      ;(g.edges.getAttribute('position') as BufferAttribute).needsUpdate = true
      radiating.sel.update()
      radiating.hov.update()
    }
    if (flags.emph) {
      ;(g.stars.getAttribute('aEmph') as BufferAttribute).needsUpdate = true
      ;(g.edges.getAttribute('aAlpha') as BufferAttribute).needsUpdate = true
    }
    if (flags.hover) (g.stars.getAttribute('aHover') as BufferAttribute).needsUpdate = true

    const intro = shared.uIntro.value
    const on = shared.uIntroOn.value > 0.5
    const edgeIntro = on ? smoothstep(2.2, 3.6, intro) : 1
    const edgeOpacity = (runtime.showConnections ? runtime.connectionOpacity : 0) * edgeIntro
    const mats = materials
    for (const mat of [mats.edgesBack, mats.edgesFront]) {
      const u = mat.uniforms.uOpacity
      u.value += (edgeOpacity - u.value) * (1 - Math.exp(-dt * 6))
    }
    mats.starsBack.uniforms.uBrightness.value = runtime.starBrightness
    mats.starsFront.uniforms.uBrightness.value = runtime.starBrightness

    const now = performance.now()
    const reduced = runtime.reducedMotion
    const selP = reduced ? 1.2 : Math.min(1.2, (now - radiating.sel.started) / 750)
    const hovP = reduced ? 1.2 : Math.min(1.2, (now - radiating.hov.started) / 320)
    mats.selBack.uniforms.uProgress.value = selP
    mats.selFront.uniforms.uProgress.value = selP
    mats.hovBack.uniforms.uProgress.value = hovP
    mats.hovFront.uniforms.uProgress.value = hovP
  }, -1)

  const r = refs.current
  return (
    <group>
      <points ref={(o) => void (r.starsBack = hold(o as Points | LineSegments | null))} geometry={geometries.stars} material={materials.starsBack} renderOrder={1} frustumCulled={false} />
      <lineSegments ref={(o) => void (r.edgesBack = hold(o as Points | LineSegments | null))} geometry={geometries.edges} material={materials.edgesBack} renderOrder={1} frustumCulled={false} />
      <lineSegments ref={(o) => void (r.selBack = hold(o as Points | LineSegments | null))} geometry={radiating.sel.geometry} material={materials.selBack} renderOrder={1} frustumCulled={false} />
      <lineSegments ref={(o) => void (r.hovBack = hold(o as Points | LineSegments | null))} geometry={radiating.hov.geometry} material={materials.hovBack} renderOrder={1} frustumCulled={false} />
      <lineSegments ref={(o) => void (r.edgesFront = hold(o as Points | LineSegments | null))} geometry={geometries.edges} material={materials.edgesFront} renderOrder={3} frustumCulled={false} />
      <lineSegments ref={(o) => void (r.selFront = hold(o as Points | LineSegments | null))} geometry={radiating.sel.geometry} material={materials.selFront} renderOrder={3} frustumCulled={false} />
      <lineSegments ref={(o) => void (r.hovFront = hold(o as Points | LineSegments | null))} geometry={radiating.hov.geometry} material={materials.hovFront} renderOrder={3} frustumCulled={false} />
      <points ref={(o) => void (r.starsFront = hold(o as Points | LineSegments | null))} geometry={geometries.stars} material={materials.starsFront} renderOrder={4} frustumCulled={false} />
    </group>
  )
}
