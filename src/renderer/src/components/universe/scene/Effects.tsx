import { useMemo } from 'react'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import { HalfFloatType } from 'three'
import type { QualityProfile } from '../shared'

/**
 * Post-processing: selective bloom (only the black hole's hottest regions
 * and highlighted stars exceed the threshold) and a gentle vignette.
 */
export function Effects({ quality }: { quality: QualityProfile }) {
  const effects = useMemo(() => {
    const list = []
    if (quality.bloom) {
      list.push(
        <Bloom
          key="bloom"
          mipmapBlur
          intensity={0.85}
          luminanceThreshold={0.55}
          luminanceSmoothing={0.3}
          radius={0.74}
          levels={quality.multisampling >= 4 ? 7 : 6}
        />
      )
    }
    list.push(<Vignette key="vignette" offset={0.3} darkness={0.62} />)
    return list
  }, [quality])

  return (
    <EffectComposer multisampling={quality.multisampling} frameBufferType={HalfFloatType} enableNormalPass={false}>
      {effects}
    </EffectComposer>
  )
}
