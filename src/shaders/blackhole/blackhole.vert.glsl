// Camera-facing billboard that hosts the ray-marched black hole.
uniform float uHalfW;
uniform float uHalfH;
varying vec3 vWorld;
varying vec2 vQuad; // billboard coordinates in world units

void main() {
  vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 world = camRight * position.x * uHalfW + camUp * position.y * uHalfH;
  vWorld = world;
  vQuad = vec2(position.x * uHalfW, position.y * uHalfH);
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
