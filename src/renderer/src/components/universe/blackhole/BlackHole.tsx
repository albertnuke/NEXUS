import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { AddEquation, CustomBlending, OneFactor, OneMinusSrcAlphaFactor, PlaneGeometry, ShaderMaterial } from 'three'
import noise from '@shaders/common/noise.glsl?raw'
import vert from '@shaders/blackhole/blackhole.vert.glsl?raw'
import frag from '@shaders/blackhole/blackhole.frag.glsl?raw'
import { BH_SCALE, runtime, shared } from '../shared'

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1)
  return t * t * (3 - 2 * t)
}

/**
 * The black hole: a camera-facing billboard whose fragment shader ray-marches
 * bent light paths through a procedural accretion disk (see blackhole.frag).
 */
export function BlackHole({ steps, octaves }: { steps: number; octaves: number }) {
  const geometry = useMemo(() => new PlaneGeometry(2, 2, 1, 1), [])
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: vert,
        fragmentShader: `${noise}\n${frag}`,
        uniforms: {
          uTime: shared.uTime,
          uScale: { value: BH_SCALE },
          uIntensity: { value: 0 },
          uDiskGain: { value: 1 },
          uSteps: { value: steps },
          uTurb: { value: 0.5 },
          uStreak: { value: 1 },
          uOctaves: { value: octaves },
          uStretch: { value: 0 },
          uHalfW: { value: 70 * BH_SCALE },
          uHalfH: { value: 26 * BH_SCALE }
        },
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: CustomBlending,
        blendEquation: AddEquation,
        blendSrc: OneFactor,
        blendDst: OneMinusSrcAlphaFactor
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  useEffect(() => {
    material.uniforms.uOctaves.value = octaves
  }, [material, octaves])

  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material]
  )

  useFrame((state) => {
    const u = material.uniforms
    const intro = shared.uIntro.value
    const on = shared.uIntroOn.value > 0.5
    u.uIntensity.value = on ? smoothstep(0.35, 2.1, intro) : 1
    u.uDiskGain.value = on ? 0.3 + 0.7 * smoothstep(1.1, 3.2, intro) : 1
    const t = shared.uTime.value
    // Slow, smooth variations: turbulence and occasional elongation of the disk texture.
    u.uTurb.value = 0.5 + 0.28 * Math.sin(t * 0.021) + 0.18 * Math.sin(t * 0.057 + 1.3)
    u.uStretch.value = smoothstep(0.55, 1, 0.5 + 0.5 * Math.sin(t * 0.0131 + 0.4)) * 0.8
    u.uStreak.value = 1 + 0.08 * Math.sin(t * 0.09)

    // Level of detail: the closer the camera, the larger the black hole on
    // screen; trade a few integration steps for frame rate.
    const px = shared.uBHNdcRadius.value * state.size.height * 0.5 * state.viewport.dpr
    const lod = px > 260 ? Math.max(0.5, 260 / px) : 1
    u.uSteps.value = Math.round(Math.max(64, steps * lod))
    void runtime
  })

  return <mesh geometry={geometry} material={material} renderOrder={2} frustumCulled={false} />
}
