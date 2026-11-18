// Edges radiating from the selected / hovered star.
attribute float aT;        // 0 at the source star, 1 at the linked star
varying float vT;
varying float vViewZ;
void main() {
  vT = aT;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vViewZ = mv.z;
  gl_Position = projectionMatrix * mv;
}
