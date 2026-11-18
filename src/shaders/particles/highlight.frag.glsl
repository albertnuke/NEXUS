uniform float uProgress;   // 0..1 radiating reveal
uniform float uTime;
uniform float uStrength;
uniform float uMotion;
uniform vec3 uColor;
uniform float uSide;
uniform float uBHViewZ;
varying float vT;
varying float vViewZ;

void main() {
  if ((vViewZ - uBHViewZ) * uSide < 0.0) discard;
  float reveal = 1.0 - smoothstep(uProgress - 0.12, uProgress + 0.02, vT);
  float pulsePos = fract(uTime * 0.32 * uMotion);
  float pulse = exp(-pow((vT - pulsePos) * 7.0, 2.0)) * 0.9;
  float fade = mix(1.0, 0.55, vT);
  float a = reveal * (0.55 * fade + pulse * uMotion) * uStrength;
  gl_FragColor = vec4(uColor * a, 1.0);
}
