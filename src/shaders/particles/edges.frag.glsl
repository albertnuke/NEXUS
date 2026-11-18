uniform float uOpacity;
uniform float uSide;
uniform float uBHViewZ;
uniform vec3 uColor;
varying float vAlpha;
varying float vViewZ;

void main() {
  if ((vViewZ - uBHViewZ) * uSide < 0.0) discard;
  float a = vAlpha * uOpacity;
  if (a < 0.0005) discard;
  gl_FragColor = vec4(uColor * a, 1.0);
}
