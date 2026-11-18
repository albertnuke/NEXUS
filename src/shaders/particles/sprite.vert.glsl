// Bright leading particles of the orbital arcs.
attribute float aSize;
attribute float aAlpha;
uniform float uPixelRatio;
varying float vAlpha;
varying float vSize;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  vSize = aSize * uPixelRatio * 5.0;
  vAlpha = aAlpha;
  gl_PointSize = vSize;
}
