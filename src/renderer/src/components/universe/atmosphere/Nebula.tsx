import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  BufferAttribute,
  BufferGeometry,
  HalfFloatType,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  Scene,
  ShaderMaterial,
  WebGLRenderTarget,
  type PerspectiveCamera
} from 'three'
import noise from '@shaders/common/noise.glsl?raw'
import vert from '@shaders/nebula/nebula.vert.glsl?raw'
import frag from '@shaders/nebula/nebula.frag.glsl?raw'
import compVert from '@shaders/nebula/composite.vert.glsl?raw'
import compFrag from '@shaders/nebula/composite.frag.glsl?raw'
import { shared } from '../shared'

function fullscreenTriangle(): BufferGeometry {
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3))
  return g
}

/**
 * Procedural dark nebula. Rendered at a fraction of the screen resolution
 * into a half-float target (it is soft by nature) and composited behind
 * everything with dithering.
 */
export function Nebula({ scale, octaves }: { scale: number; octaves: number }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const res = useMemo(() => {
    const target = new WebGLRenderTarget(4, 4, {
      type: HalfFloatType,
      depthBuffer: false,
      magFilter: LinearFilter,
      minFilter: LinearFilter
    })
    const geometry = fullscreenTriangle()
    const nebulaMat = new ShaderMaterial({
      vertexShader: vert,
      fragmentShader: `${noise}\n${frag}`,
      uniforms: {
        uInvProjection: { value: camera.projectionMatrixInverse },
        uCameraWorld: { value: camera.matrixWorld },
        uTime: shared.uTime,
        uFade: { value: 0 },
        uOctaves: { value: octaves },
        uCamPos: { value: camera.position }
      },
      depthTest: false,
      depthWrite: false
    })
    const scene = new Scene()
    const mesh = new Mesh(geometry, nebulaMat)
    mesh.frustumCulled = false
    scene.add(mesh)
    const ortho = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const compositeMat = new ShaderMaterial({
      vertexShader: compVert,
      fragmentShader: `${noise}\n${compFrag}`,
      uniforms: { uTex: { value: target.texture }, uResolution: { value: [1, 1] }, uTime: shared.uTime },
      depthTest: false,
      depthWrite: false
    })
    return { target, geometry, nebulaMat, scene, ortho, compositeMat }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera])

  useEffect(() => {
    res.nebulaMat.uniforms.uOctaves.value = octaves
  }, [res, octaves])

  useEffect(
    () => () => {
      res.target.dispose()
      res.geometry.dispose()
      res.nebulaMat.dispose()
      res.compositeMat.dispose()
    },
    [res]
  )

  useFrame((state) => {
    const { gl, size } = state
    const dpr = state.viewport.dpr
    const w = Math.max(32, Math.round(size.width * dpr * scale))
    const h = Math.max(32, Math.round(size.height * dpr * scale))
    if (res.target.width !== w || res.target.height !== h) res.target.setSize(w, h)
    const intro = shared.uIntro.value
    const fade = shared.uIntroOn.value > 0.5 ? Math.min(1, Math.max(0, (intro - 0.1) / 1.6)) : 1
    res.nebulaMat.uniforms.uFade.value = fade * fade * (3 - 2 * fade)
    const prev = gl.getRenderTarget()
    gl.setRenderTarget(res.target)
    gl.render(res.scene, res.ortho)
    gl.setRenderTarget(prev)
  }, -1)

  return <mesh geometry={res.geometry} material={res.compositeMat} renderOrder={-100} frustumCulled={false} />
}
