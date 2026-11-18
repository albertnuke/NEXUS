// Upsamples the low-resolution nebula and dithers to avoid banding in the darks.
uniform sampler2D uTex;
uniform vec2 uResolution;
uniform float uTime;
varying vec2 vUv;

void main() {
  vec3 col = texture2D(uTex, vUv).rgb;
  float n = hash12(gl_FragCoord.xy + fract(uTime * 7.13) * 91.7) - 0.5;
  col += n * (1.5 / 255.0) * 0.08;
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
