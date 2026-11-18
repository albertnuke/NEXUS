varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = (1.0 - smoothstep(0.25, 0.5, d)) * vAlpha;
  if (a < 0.002) discard;
  gl_FragColor = vec4(vec3(0.62, 0.60, 0.57) * a, 1.0);
}
