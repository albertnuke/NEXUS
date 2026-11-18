// Full-screen triangle; reconstructs the world-space view ray per pixel.
uniform mat4 uInvProjection;
uniform mat4 uCameraWorld;
varying vec3 vDir;

void main() {
  vec2 ndc = position.xy;
  vec4 view = uInvProjection * vec4(ndc, 1.0, 1.0);
  vDir = (uCameraWorld * vec4(view.xyz / view.w, 0.0)).xyz;
  gl_Position = vec4(ndc, 0.0, 1.0);
}
