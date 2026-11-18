uniform float uHead;     // 0..1 position of the leading particle
uniform float uTrail;    // trail length (fraction of the orbit)
uniform float uBase;     // faint base line opacity
uniform float uFade;
varying float vU;

void main() {
  float behind = fract(uHead - vU);
  float trail = behind < uTrail ? pow(1.0 - behind / uTrail, 2.4) : 0.0;
  float a = (uBase + trail * 0.55) * uFade;
  gl_FragColor = vec4(vec3(0.92, 0.91, 0.88) * a, 1.0);
}
