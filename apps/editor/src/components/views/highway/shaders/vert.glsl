varying vec2 vUv;
varying float vWorldZ;
void main() {
  vUv = uv;
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldZ = worldPosition.z;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
