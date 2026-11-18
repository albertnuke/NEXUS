import { useFrame, useThree } from '@react-three/fiber'
import { Vector3, type PerspectiveCamera } from 'three'
import { BH_SCALE, domUpdaters, rig, runtime, shared } from '../shared'
import { useStore } from '../../../state/store'

const origin = new Vector3()
const tmp = new Vector3()
const edge = new Vector3()
const right = new Vector3()

/**
 * Advances global time, the camera rig and black-hole screen-space uniforms
 * before anything else renders, then runs DOM overlay updaters.
 */
export function FrameDriver() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const inertia = useStore((s) => s.settings.camera.inertia)

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1)
    const now = performance.now()
    const motion = runtime.reducedMotion ? 0.18 : 1
    shared.uMotion.value = 1
    shared.uTime.value += dt * motion
    shared.uIntro.value = (now - runtime.introStart) / 1000
    shared.uIntroOn.value = runtime.reducedMotion ? 0 : 1
    shared.uPixelRatio.value = state.viewport.dpr
    const aspect = state.size.width / Math.max(1, state.size.height)
    shared.uAspect.value = aspect
    if (Math.abs(rig.aspect - aspect) > 1e-3) rig.fit(aspect)

    rig.update(dt, now, inertia)
    rig.apply(camera)
    runtime.camera = camera

    // Black hole in view space / NDC, used to split render passes and to
    // soften stars that pass in front of it.
    tmp.copy(origin).applyMatrix4(camera.matrixWorldInverse)
    shared.uBHViewZ.value = tmp.z
    const ndc = origin.clone().project(camera)
    shared.uBHNdc.value.set(ndc.x, ndc.y)
    right.setFromMatrixColumn(camera.matrixWorld, 0)
    edge.copy(right).multiplyScalar(BH_SCALE * 3.4).project(camera)
    shared.uBHNdcRadius.value = Math.abs(edge.x - ndc.x) * aspect
  }, -2)

  useFrame((state) => {
    for (const fn of domUpdaters) fn(camera, state.size.width, state.size.height)
  }, 0)

  return null
}
