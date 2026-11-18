import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, BufferAttribute, BufferGeometry, Points, ShaderMaterial, Sphere, Vector3 } from 'three'
import vert from '@shaders/particles/dust.vert.glsl?raw'
import frag from '@shaders/particles/dust.frag.glsl?raw'
import { shared } from '../shared'

function mulberry(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Decorative interstellar dust. Purely atmospheric: tiny, dim, never
 * interactive and clearly distinct from knowledge stars.
 */
export function Dust({ count }: { count: number }) {
  const ref = useRef<Points>(null)
  const geometry = useMemo(() => {
    const r = mulberry(1337)
    const n = Math.max(0, Math.round(count))
    const pos = new Float32Array(n * 3)
    const size = new Float32Array(n)
    const bright = new Float32Array(n)
    const phase = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const u = r()
      let x: number, y: number, z: number
      if (u < 0.55) {
        // Broad, faint shell around the scene.
        const rad = 140 + Math.pow(r(), 0.7) * 650
        const th = r() * Math.PI * 2
        const ph = Math.acos(2 * r() - 1)
        x = rad * Math.sin(ph) * Math.cos(th)
        y = rad * Math.cos(ph) * 0.8
        z = rad * Math.sin(ph) * Math.sin(th)
      } else {
        // Thin galactic plane aligned with the accretion disk.
        const rad = 50 + Math.pow(r(), 0.8) * 420
        const th = r() * Math.PI * 2
        x = rad * Math.cos(th)
        z = rad * Math.sin(th)
        y = (r() - 0.5) * (6 + rad * 0.08)
      }
      pos.set([x, y, z], i * 3)
      size[i] = 0.55 + r() * 0.75
      bright[i] = 0.05 + Math.pow(r(), 3) * 0.24
      phase[i] = r()
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(pos, 3))
    g.setAttribute('aSize', new BufferAttribute(size, 1))
    g.setAttribute('aBright', new BufferAttribute(bright, 1))
    g.setAttribute('aPhase', new BufferAttribute(phase, 1))
    g.boundingSphere = new Sphere(new Vector3(), 2000)
    return g
  }, [count])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        uniforms: { uTime: shared.uTime, uPixelRatio: shared.uPixelRatio, uFade: { value: 0 }, uMotion: shared.uMotion },
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: AdditiveBlending
      }),
    []
  )

  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])

  useFrame((_s, delta) => {
    if (ref.current) ref.current.rotation.y += Math.min(delta, 0.1) * 0.0035 * shared.uMotion.value
    const intro = shared.uIntro.value
    material.uniforms.uFade.value = shared.uIntroOn.value > 0.5 ? Math.min(1, Math.max(0, (intro - 0.3) / 1.8)) : 1
  })

  return <points ref={ref} geometry={geometry} material={material} renderOrder={0} frustumCulled={false} />
}
