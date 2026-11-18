// Stylised, physically inspired Schwarzschild black hole.
//
// Each pixel traces a light ray backwards from the camera. The ray is bent
// by an approximation of the Schwarzschild photon equation
//     x'' = -1.5 h^2 x / |x|^5
// (units where the Schwarzschild radius Rs = 1). Whenever the ray crosses
// the accretion disk plane (y = 0) we shade the disk at that point, which
// naturally produces the lensed arc over the top of the shadow, the
// secondary image below it and the thin bright band crossing the horizon.

uniform float uTime;
uniform float uScale;      // world units per Rs
uniform float uIntensity;  // intro / global fade
uniform float uDiskGain;
uniform int uSteps;
uniform float uTurb;       // slowly varying turbulence (0..1)
uniform float uStreak;     // strength of the horizontal light structure
uniform int uOctaves;
uniform float uStretch;    // occasional elongation of the accretion texture

varying vec3 vWorld;
varying vec2 vQuad;

#define RB 18.0      // bounding sphere radius
#define R_IN 2.6     // inner disk edge (just outside the photon sphere / ISCO region)
#define R_OUT 15.5   // outer disk edge
#define B_CRIT 2.598 // critical impact parameter (3*sqrt(3)/2 Rs)

const vec3 HOT = vec3(1.0, 0.94, 0.84);
const vec3 GOLD = vec3(0.957, 0.780, 0.478); // #F4C77A
const vec3 ORANGE = vec3(0.86, 0.46, 0.17);
const vec3 EMBER = vec3(0.38, 0.13, 0.04);

vec3 diskRamp(float temp) {
  // temp ~ 0 (cool, outer) .. 1.4 (hot, inner / blue-shifted)
  vec3 g = srgbToLinear(GOLD);
  vec3 o = srgbToLinear(ORANGE);
  vec3 e = srgbToLinear(EMBER);
  vec3 h = srgbToLinear(HOT);
  vec3 c = mix(e, o, smoothstep(0.0, 0.35, temp));
  c = mix(c, g, smoothstep(0.3, 0.7, temp));
  c = mix(c, h, smoothstep(0.65, 1.15, temp));
  return c;
}

// Accretion texture sampled in co-rotating polar coordinates. Two phases are
// cross-faded so differential (Keplerian) rotation never winds the pattern up.
float diskTexture(float r, float phi, float phase, float omega) {
  float a = phi + omega * phase;
  vec2 cs = vec2(cos(a), sin(a));
  float lr = log(r);
  vec3 q = vec3(cs * (1.4 + uStretch * 0.6), lr * 4.5);
  float n1 = fbm(q * vec3(1.0, 1.0, 1.0) + vec3(0.0, 0.0, uTime * 0.015), uOctaves);
  vec3 q2 = vec3(cs * 3.6, lr * 15.0 + n1 * (1.2 + uTurb * 1.6));
  float n2 = fbm(q2, max(uOctaves - 1, 2));
  float rings = 0.5 + 0.5 * sin(lr * 34.0 + n1 * 7.0 + n2 * 3.0);
  float fine = snoise(vec3(cs * 26.0, lr * 80.0));
  float speck = pow(max(fine, 0.0), 6.0) * 2.4;
  return (0.25 + 1.1 * n2 * (0.55 + 0.45 * rings)) * (0.75 + 0.5 * n1) + speck;
}

vec4 shadeDisk(vec3 hit, vec3 dir) {
  float r = length(hit.xz);
  if (r < R_IN || r > R_OUT) return vec4(0.0);
  float phi = atan(hit.z, hit.x);
  float omega = 2.2 * pow(r, -1.5);

  const float PERIOD = 36.0;
  float t1 = mod(uTime, PERIOD);
  float t2 = mod(uTime + PERIOD * 0.5, PERIOD);
  float w = abs(t1 / PERIOD * 2.0 - 1.0); // triangle weight
  float tex = mix(diskTexture(r, phi, t1, omega), diskTexture(r, phi, t2, omega), w);

  float inner = smoothstep(R_IN, R_IN + 0.8, r);
  float outer = 1.0 - smoothstep(R_OUT * 0.42, R_OUT, r);
  float profile = inner * outer * pow(R_IN / r, 1.25);
  float dens = profile * tex;

  // Relativistic beaming: the side moving toward the observer is brighter.
  vec3 velDir = normalize(vec3(hit.z, 0.0, -hit.x));
  float beta = min(0.75 * sqrt(0.5 / r), 0.6);
  float gamma = inversesqrt(1.0 - beta * beta);
  float cosT = dot(velDir, -dir);
  float g = 1.0 / (gamma * (1.0 - beta * cosT));
  float grav = sqrt(max(1.0 - 1.0 / r, 0.05));
  float shift = g * grav;
  float beaming = mix(1.0, pow(g, 3.0), 0.62);

  float temp = clamp(pow(R_IN / r, 0.9) * 1.25 * shift, 0.0, 1.5);
  vec3 col = diskRamp(temp) * (0.22 + 1.45 * pow(temp, 2.2));

  // Grazing views look through more material: brighter and more opaque.
  float mu = max(abs(normalize(dir).y), 0.045);
  float alpha = 1.0 - exp(-dens * 1.7 / mu);
  float glow = mix(1.0, min(1.0 / mu, 8.0), 0.3);
  col *= dens * beaming * glow * uDiskGain;
  return vec4(col, clamp(alpha, 0.0, 1.0));
}

void main() {
  vec3 ro = cameraPosition / uScale;
  vec3 rd = normalize(vWorld - cameraPosition);
  vec2 q = vQuad / uScale; // billboard coordinates in Rs

  vec3 col = vec3(0.0);
  float trans = 1.0;
  bool captured = false;

  // Impact parameter of the undeflected ray.
  float bProj = dot(ro, rd);
  vec3 closest = ro - rd * bProj;
  float b = length(closest);

  float B = dot(ro, rd);
  float C = dot(ro, ro) - RB * RB;
  float H = B * B - C;
  if (H > 0.0 && -B + sqrt(H) > 0.0) {
    float t0 = max(-B - sqrt(H), 0.0);
    vec3 p = ro + rd * t0;
    vec3 v = rd;
    vec3 hv = cross(p, v);
    float h2 = dot(hv, hv);
    for (int i = 0; i < 260; i++) {
      if (i >= uSteps) break;
      float r2 = dot(p, p);
      float r = sqrt(r2);
      if (r < 1.0) {
        captured = true;
        break;
      }
      float dt = clamp(0.085 * r * (r < 4.0 ? 0.7 : 1.0), 0.025, 0.9);
      vec3 acc = -1.5 * h2 * p / (r2 * r2 * r);
      vec3 prev = p;
      v += acc * dt;
      p += v * dt;
      if (prev.y * p.y < 0.0) {
        float f = prev.y / (prev.y - p.y);
        vec3 hit = mix(prev, p, f);
        vec4 d = shadeDisk(hit, normalize(v));
        col += trans * d.rgb * d.a;
        trans *= 1.0 - d.a;
        if (trans < 0.015) break;
      }
      if (r > RB + 0.5 && dot(p, v) > 0.0) break;
    }
  }

  // Photon ring: a razor-thin luminous rim at the critical impact parameter.
  float ringCore = exp(-pow((b - B_CRIT) / 0.045, 2.0));
  float ringSoft = exp(-pow((b - B_CRIT - 0.12) / 0.55, 2.0));
  vec3 gold = srgbToLinear(GOLD);
  vec3 hot = srgbToLinear(HOT);
  float camElev = abs(normalize(cameraPosition).y);
  float outside = smoothstep(B_CRIT - 0.06, B_CRIT + 0.25, b);
  col += trans * (hot * ringCore * 1.4 + gold * ringSoft * 0.16 * outside);

  // Soft gravitational glow around the system (never inside the shadow).
  float halo = exp(-max(b - B_CRIT, 0.0) * 0.32) * 0.035 + exp(-max(b - B_CRIT, 0.0) * 1.4) * 0.08;
  col += trans * gold * halo * outside;

  // Thin, extremely bright horizontal structure along the disk plane. The
  // left side (approaching) extends further and is slightly brighter.
  float side = q.x < 0.0 ? 1.0 : 0.0;
  float reach = mix(8.5, 12.5, side);
  float ax = abs(q.x);
  float thickness = 0.13 + ax * 0.008;
  float band = exp(-pow(q.y / thickness, 2.0));
  float bandWide = exp(-abs(q.y) / (0.6 + ax * 0.03)) * 0.4;
  float along = exp(-ax / reach) * (0.75 + 0.25 * side);
  float flick = 0.85 + 0.15 * snoise(vec3(q.x * 0.35 - uTime * 0.25, uTime * 0.05, 3.0));
  float edgeOn = 1.0 - smoothstep(0.07, 0.36, camElev);
  vec3 bandCol = mix(srgbToLinear(ORANGE), hot, exp(-ax / 7.0));
  float centre = exp(-ax / 3.2);
  col += bandCol * (band * (0.9 + 2.2 * centre) + bandWide * 0.1) * along * flick * uStreak * edgeOn;

  // Filmic shoulder: keeps gold detail instead of clipping to flat white.
  col = vec3(1.0) - exp(-col * 1.35);

  float alpha = captured ? 1.0 : 1.0 - trans;
  col *= uIntensity;
  alpha *= uIntensity;
  // Premultiplied output: dark shadow occludes, light adds.
  gl_FragColor = vec4(col, alpha);
}
