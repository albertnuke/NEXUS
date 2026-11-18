// Dark, smoky interstellar dust. Rendered at reduced resolution into an
// offscreen target, then upsampled (see nebulaComposite).
uniform float uTime;
uniform float uFade;
uniform int uOctaves;
uniform vec3 uCamPos;
varying vec3 vDir;

void main() {
  vec3 d = normalize(vDir);
  float t = uTime * 0.0045;
  vec3 p = d * 1.9 + vec3(t, t * 0.55, -t * 0.35);

  // Domain warping gives wispy, non-repeating structure.
  vec3 w = vec3(fbm(p + vec3(1.7, 0.0, 0.0), uOctaves), fbm(p + vec3(8.3, 2.8, 0.0), uOctaves), fbm(p + vec3(0.0, 4.1, 6.2), uOctaves));
  float n = fbm(p * 1.15 + (w - 0.5) * 2.2, uOctaves);
  float n2 = fbm(p * 3.1 - (w - 0.5) * 1.3 + 7.7, uOctaves);
  float clouds = smoothstep(0.42, 0.86, n) * 0.9 + smoothstep(0.52, 0.92, n2) * 0.45 * smoothstep(0.35, 0.7, n);
  float lanes = smoothstep(0.56, 0.78, fbm(p * 2.3 + 3.1, max(uOctaves - 1, 2)));
  clouds *= 1.0 - 0.65 * lanes;
  float region = smoothstep(0.3, 0.75, fbm(d * 0.7 + 11.0, 3));
  clouds *= 0.35 + 1.1 * region;

  vec3 base = srgbToLinear(vec3(0.0118, 0.0118, 0.0157));   // #030304
  vec3 charcoal = srgbToLinear(vec3(0.039, 0.039, 0.051));  // #0A0A0D
  vec3 shadow = srgbToLinear(vec3(0.075, 0.075, 0.086));    // #131316
  vec3 col = base;
  col = mix(col, charcoal * 1.15, clamp(clouds, 0.0, 1.0));
  col = mix(col, shadow * 1.45, clamp(pow(clouds, 2.0) * 0.9, 0.0, 1.0));

  // Very faint warm light scattered from the black hole.
  float toBH = max(dot(d, normalize(-uCamPos)), 0.0);
  vec3 warm = srgbToLinear(vec3(0.957, 0.78, 0.478));
  col += warm * pow(toBH, 30.0) * 0.010 * (0.4 + clouds);
  col += warm * pow(toBH, 6.0) * 0.0016 * clouds;

  gl_FragColor = vec4(col * uFade, 1.0);
}
