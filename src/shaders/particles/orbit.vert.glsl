attribute float aU;   // 0..1 parameter along the orbit
varying float vU;
void main() {
  vU = aU;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
