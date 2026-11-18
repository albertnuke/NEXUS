// Decorative background dust — never interactive, deliberately dimmer and
// smaller than knowledge stars.
attribute float aSize;
attribute float aBright;
attribute float aPhase;
uniform float uTime;
uniform float uPixelRatio;
uniform float uFade;
uniform float uMotion;
varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float tw = 0.7 + 0.3 * sin(uTime * uMotion * (0.3 + aPhase) + aPhase * 40.0);
  vAlpha = aBright * tw * uFade;
  gl_PointSize = max(aSize * uPixelRatio, 1.0);
}
