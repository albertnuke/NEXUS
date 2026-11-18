varying float vAlpha;
varying float vSize;
void main() {
  float e = length(gl_PointCoord - 0.5);
  float d = e * vSize;
  float edge = 1.0 - smoothstep(0.32, 0.5, e);
  float r = vSize / 10.0;
  float core = 1.0 - smoothstep(r - 0.6, r + 0.6, d);
  float halo = exp(-d / (r * 2.2)) * 0.5;
  float a = (core * 1.6 + halo) * vAlpha * edge;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vec3(1.0, 0.98, 0.95) * a, 1.0);
}
