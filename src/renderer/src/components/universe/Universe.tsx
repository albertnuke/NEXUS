import { useEffect, useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { NoToneMapping } from 'three'
import { BlackHole } from './blackhole/BlackHole'
import { Constellation } from './stars/Constellation'
import { Nebula } from './atmosphere/Nebula'
import { Dust } from './atmosphere/Dust'
import { Orbitals } from './atmosphere/Orbitals'
import { FrameDriver } from './scene/FrameDriver'
import { Interaction } from './scene/Interaction'
import { Effects } from './scene/Effects'
import { Labels } from './labels/Labels'
import { Director } from './Director'
import { QUALITY, rig, runtime } from './shared'
import { FOV } from './camera/cameraRig'
import { useReducedMotion, useStore } from '../../state/store'
import { nexus } from '../../lib/bridge'

/**
 * The knowledge universe: a single full-window WebGL canvas. Everything else
 * in the interface floats above it.
 */
export function Universe() {
  const settings = useStore((s) => s.settings)
  const reduced = useReducedMotion()
  const quality = QUALITY[settings.quality]
  const [visible, setVisible] = useState(!document.hidden)
  const [dprCap, setDprCap] = useState(quality.dpr[1])

  // Mirror settings into the render loop's runtime flags.
  useEffect(() => {
    runtime.showConnections = settings.showConnections
    runtime.connectionOpacity = settings.connectionOpacity
    runtime.starBrightness = settings.starBrightness
    runtime.orbitals = settings.orbitalsEnabled
  }, [settings])

  useEffect(() => {
    runtime.reducedMotion = reduced
  }, [reduced])

  useEffect(() => setDprCap(quality.dpr[1]), [quality])

  // Pause rendering while the window is hidden or minimised.
  useEffect(() => {
    const onVis = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', onVis)
    const off = nexus.app.onVisibility((v) => setVisible(v && !document.hidden))
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      off()
    }
  }, [])

  // Adaptive resolution: if the frame rate sags, lower the pixel ratio.
  useEffect(() => {
    if (!visible) return
    let frames = 0
    let start = performance.now()
    let raf = 0
    const tick = () => {
      frames++
      const now = performance.now()
      if (now - start > 2500) {
        const fps = (frames * 1000) / (now - start)
        setDprCap((cap) => {
          const max = Math.min(quality.dpr[1], window.devicePixelRatio || 1)
          if (fps < 42 && cap > 1) return Math.max(1, cap - 0.25)
          if (fps > 57 && cap < max) return Math.min(max, cap + 0.25)
          return cap
        })
        frames = 0
        start = now
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [visible, quality])

  const dustCount = useMemo(() => Math.round(5200 * quality.dust * settings.dustDensity), [quality, settings.dustDensity])
  const dpr = Math.min(dprCap, window.devicePixelRatio || 1)

  return (
    <div className="absolute inset-0">
      <Canvas
        dpr={[1, Math.max(1, dpr)]}
        flat
        frameloop={visible ? 'always' : 'never'}
        gl={{ antialias: false, alpha: false, stencil: false, depth: false, powerPreference: 'high-performance', toneMapping: NoToneMapping }}
        camera={{ fov: FOV, near: 1, far: 6000, position: [0, 40, rig.homeDistance] }}
        onCreated={({ gl }) => gl.setClearColor('#030304', 1)}
        style={{ background: '#030304' }}
      >
        <FrameDriver />
        <Nebula scale={quality.nebulaScale} octaves={quality.noiseOctaves} />
        <Dust count={dustCount} />
        <Orbitals enabled={settings.orbitalsEnabled} />
        <Constellation />
        <BlackHole steps={quality.bhSteps} octaves={quality.noiseOctaves} />
        <Interaction />
        <Effects quality={quality} />
      </Canvas>
      <Labels />
      <Director />
    </div>
  )
}
