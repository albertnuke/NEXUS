attribute float aAlpha;
attribute float aPhase;
uniform float uTime;
uniform float uMotion;
varying float vAlpha;
varying float vViewZ;

void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vViewZ = mv.z;
  float shimmer = 0.78 + 0.22 * sin(uTime * uMotion * 0.33 + aPhase * 6.2831);
  vAlpha = aAlpha * shimmer;
  gl_Position = projectionMatrix * mv;
}
