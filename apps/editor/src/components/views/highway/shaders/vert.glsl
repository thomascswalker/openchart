varying vec2 vUv;
varying float vWorldZ;
#ifdef USE_INSTANCE_STATE
attribute vec4 aLaneColorSelected;
varying vec4 vLaneColorSelected;
#endif
void main() {
  vUv = uv;
  mat4 model = modelMatrix;
  #ifdef USE_INSTANCING
    model = modelMatrix * instanceMatrix;
  #endif
  #ifdef USE_INSTANCE_STATE
    vLaneColorSelected = aLaneColorSelected;
  #endif
  vec4 worldPosition = model * vec4(position, 1.0);
  vWorldZ = worldPosition.z;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
