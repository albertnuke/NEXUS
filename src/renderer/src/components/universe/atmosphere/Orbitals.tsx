import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
  Euler,
  Line,
  Matrix4,
  ShaderMaterial,
  Sphere,
  Vector3
} from 'three'
import orbitVert from '@shaders/particles/orbit.vert.glsl?raw'
import orbitFrag from '@shaders/particles/orbit.frag.glsl?raw'
import spriteVert from '@shaders/particles/sprite.vert.glsl?raw'
import spriteFrag from '@shaders/particles/sprite.frag.glsl?raw'
import { runtime, shared } from '../shared'

interface OrbitDef {
  rx: number
  ry: number
  rot: [number, number, number]
  offset: [number, number, number]
  speed: number // revolutions per minute
  phase: number
  trail: number
  base: number
}

// Enormous, understated arcs framing the constellation. Several extend
// beyond the window at the default framing.
const ORBITS: OrbitDef[] = [
  { rx: 172, ry: 122, rot: [0.22, 0.12, 0.05], offset: [0, -4, 0], speed: 0.34, phase: 0.05, trail: 0.11, base: 0.035 },
  { rx: 214, ry: 138, rot: [-0.34, 0.28, -0.12], offset: [6, 0, 0], speed: 0.24, phase: 0.42, trail: 0.09, base: 0.03 },
  { rx: 248, ry: 160, rot: [0.1, -0.42, 0.21], offset: [-8, 6, 0], speed: 0.18, phase: 0.71, trail: 0.08, base: 0.028 },
  { rx: 156, ry: 108, rot: [0.92, 0.24, 0.3], offset: [0, -6, 0], speed: 0.42, phase: 0.2, trail: 0.13, base: 0.03 },
  { rx: 292, ry: 182, rot: [-0.16, 0.58, 0.31], offset: [10, -8, -6], speed: 0.14, phase: 0.88, trail: 0.07, base: 0.025 },
  { rx: 336, ry: 206, rot: [0.38, -0.2, -0.26], offset: [-14, 4, 0], speed: 0.11, phase: 0.33, trail: 0.06, base: 0.022 },
  { rx: 138, ry: 126, rot: [1.05, 0.15, -0.42], offset: [0, 4, 0], speed: 0.5, phase: 0.6, trail: 0.14, base: 0.026 }
]

const SEGMENTS = 720

function orbitMatrix(def: OrbitDef): Matrix4 {
  return new Matrix4()
    .makeRotationFromEuler(new Euler(def.rot[0], def.rot[1], def.rot[2]))
    .setPosition(new Vector3(...def.offset))
}

function pointOnOrbit(def: OrbitDef, m: Matrix4, u: number, out: Vector3): Vector3 {
  const a = u * Math.PI * 2
  return out.set(Math.cos(a) * def.rx, Math.sin(a) * def.ry, 0).applyMatrix4(m)
}

export function Orbitals({ enabled }: { enabled: boolean }) {
  const built = useMemo(() => {
    const items = ORBITS.map((def) => {
      const m = orbitMatrix(def)
      const pos = new Float32Array((SEGMENTS + 1) * 3)
      const u = new Float32Array(SEGMENTS + 1)
      const v = new Vector3()
      for (let i = 0; i <= SEGMENTS; i++) {
        pointOnOrbit(def, m, i / SEGMENTS, v)
        pos.set([v.x, v.y, v.z], i * 3)
        u[i] = i / SEGMENTS
      }
      const geometry = new BufferGeometry()
      geometry.setAttribute('position', new BufferAttribute(pos, 3))
      geometry.setAttribute('aU', new BufferAttribute(u, 1))
      geometry.boundingSphere = new Sphere(new Vector3(), 1000)
      const material = new ShaderMaterial({
        vertexShader: orbitVert,
        fragmentShader: orbitFrag,
        uniforms: { uHead: { value: def.phase }, uTrail: { value: def.trail }, uBase: { value: def.base }, uFade: { value: 0 } },
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: AdditiveBlending
      })
      const line = new Line(geometry, material)
      line.frustumCulled = false
      line.renderOrder = 0
      return { def, m, geometry, material, line, head: def.phase }
    })
    const headPos = new Float32Array(ORBITS.length * 3)
    const headSize = new Float32Array(ORBITS.length).fill(1.6)
    const headAlpha = new Float32Array(ORBITS.length)
    const heads = new BufferGeometry()
    heads.setAttribute('position', new BufferAttribute(headPos, 3).setUsage(DynamicDrawUsage))
    heads.setAttribute('aSize', new BufferAttribute(headSize, 1))
    heads.setAttribute('aAlpha', new BufferAttribute(headAlpha, 1).setUsage(DynamicDrawUsage))
    heads.boundingSphere = new Sphere(new Vector3(), 1000)
    const headMaterial = new ShaderMaterial({
      vertexShader: spriteVert,
      fragmentShader: spriteFrag,
      uniforms: { uPixelRatio: shared.uPixelRatio },
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: AdditiveBlending
    })
    return { items, heads, headMaterial, headPos, headAlpha }
  }, [])

  useEffect(
    () => () => {
      for (const it of built.items) {
        it.geometry.dispose()
        it.material.dispose()
      }
      built.heads.dispose()
      built.headMaterial.dispose()
    },
    [built]
  )

  useFrame((_s, delta) => {
    const dt = Math.min(delta, 0.1)
    const intro = shared.uIntro.value
    const introFade = shared.uIntroOn.value > 0.5 ? Math.min(1, Math.max(0, (intro - 3.0) / 1.4)) : 1
    const fade = (enabled && runtime.orbitals ? 1 : 0) * introFade
    const motion = shared.uMotion.value
    const v = new Vector3()
    built.items.forEach((it, i) => {
      const u = it.material.uniforms
      u.uFade.value += (fade - u.uFade.value) * (1 - Math.exp(-dt * 3))
      it.head = (it.head + (dt * it.def.speed * motion) / 60) % 1
      u.uHead.value = it.head
      pointOnOrbit(it.def, it.m, it.head, v)
      built.headPos.set([v.x, v.y, v.z], i * 3)
      built.headAlpha[i] = u.uFade.value
    })
    ;(built.heads.getAttribute('position') as BufferAttribute).needsUpdate = true
    ;(built.heads.getAttribute('aAlpha') as BufferAttribute).needsUpdate = true
  })

  return (
    <group>
      {built.items.map((it, i) => (
        <primitive key={i} object={it.line} />
      ))}
      <points geometry={built.heads} material={built.headMaterial} renderOrder={5} frustumCulled={false} />
    </group>
  )
}
