uniform float uSide;      // +1 renders stars in front of the black hole, -1 behind it
uniform float uBHViewZ;

varying vec3 vColor;
varying float vAlpha;
varying float vCorePx;
varying float vSizePx;
varying float vViewZ;
varying float vHalo;

void main() {
  if ((vViewZ - uBHViewZ) * uSide < 0.0) discard;
  vec2 c = gl_PointCoord - 0.5;
  float e = length(c);
  float d = e * vSizePx; // distance from centre in device px
  float edge = 1.0 - smoothstep(0.3, 0.5, e);
  float r = max(vCorePx * 0.5, 0.5);
  float core = 1.0 - smoothstep(r - 0.6, r + 0.6, d);
  float halo = exp(-d / max(r * 1.7, 1.2)) * 0.28 * vHalo;
  float spike = 0.0;
  float a = (core + halo * edge + spike) * vAlpha;
  if (a < 0.002) discard;
  gl_FragColor = vec4(vColor * a, 1.0);
}
