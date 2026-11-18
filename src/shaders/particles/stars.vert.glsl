// Knowledge stars: one GPU point per note.
attribute float aSize;     // base apparent diameter in CSS px
attribute float aBright;   // base brightness (degree based)
attribute float aEmph;     // emphasis: 1 = normal, <1 dimmed, >1 highlighted
attribute float aHover;    // 0..1 hover amount
attribute float aPhase;    // random phase for twinkle / intro
attribute float aBirth;    // time (s) the star appeared; very negative for initial stars
attribute float aWarm;     // 0..1 colour temperature variation

uniform float uTime;
uniform float uPixelRatio;
uniform float uBrightness;
uniform float uIntro;      // seconds since launch sequence started
uniform float uIntroOn;    // 1 when the launch sequence plays
uniform float uMotion;     // 1 normal, ~0.2 reduced motion
uniform float uBHViewZ;
uniform vec2 uBHNdc;
uniform float uBHNdcRadius;
uniform float uAspect;

varying vec3 vColor;
varying float vAlpha;
varying float vCorePx;
varying float vSizePx;
varying float vViewZ;
varying float vHalo;

void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vViewZ = mv.z;
  gl_Position = projectionMatrix * mv;

  float dist = max(-mv.z, 1.0);
  float zoom = clamp(250.0 / dist, 0.55, 2.6);
  float core = aSize * mix(1.0, zoom, 0.6);
  float emphBoost = max(aEmph - 1.0, 0.0);
  core *= 1.0 + aHover * 1.1 + emphBoost * 0.55;

  // Birth animation for notes created while the app is open.
  float age = uTime - aBirth;
  float born = smoothstep(0.0, 1.6, age);
  float flash = age > 0.0 ? exp(-age * 1.8) * 2.5 : 0.0;

  // Launch sequence: stars emerge with individual delays.
  float delay = 1.3 + fract(aPhase * 7.31) * 1.5;
  float intro = mix(1.0, smoothstep(delay, delay + 0.9, uIntro), uIntroOn);

  float twinkle = 0.86 + 0.14 * sin(uTime * uMotion * (0.5 + fract(aPhase * 13.7) * 1.6) + aPhase * 6.2831);
  float bright = aBright * uBrightness * twinkle * min(aEmph, 2.4) * (1.0 + aHover * 0.9) + flash;

  // Stars in front of the black hole are softened so it stays the focal point.
  vec2 ndc = gl_Position.xy / gl_Position.w;
  vec2 dv = (ndc - uBHNdc) * vec2(uAspect, 1.0);
  float dBH = length(dv);
  float inFront = step(uBHViewZ, mv.z);
  float occl = mix(1.0, mix(0.28, 1.0, smoothstep(uBHNdcRadius * 0.55, uBHNdcRadius * 1.25, dBH)), inFront);

  vAlpha = clamp(bright, 0.0, 4.0) * born * intro * occl;
  vec3 white = vec3(0.905, 0.888, 0.846);   // #F4F2ED (linear)
  vec3 warm = vec3(1.0, 0.877, 0.665);      // #FFF1D5 (linear)
  vec3 gold = vec3(0.905, 0.565, 0.195);
  vColor = mix(white, warm, aWarm);
  vColor = mix(vColor, gold, clamp(emphBoost * 0.35 + aHover * 0.15, 0.0, 0.45));

  vCorePx = core * uPixelRatio;
  vHalo = 0.35 + emphBoost * 0.6 + aHover * 0.6;
  vSizePx = vCorePx * 4.5 + 3.0 * uPixelRatio;
  gl_PointSize = vSizePx;
}
