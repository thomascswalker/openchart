varying vec2 vUv;
varying float vWorldZ;
#ifdef USE_INSTANCE_STATE
attribute vec4 aLaneColorSelected;
varying vec4 vLaneColorSelected;
#endif
#ifdef USE_TICK_SCROLL
attribute float aStartTick;
#endif
#ifdef USE_TAIL_TICK_SCROLL
attribute vec2 aTickRange;
#endif
uniform float uCameraTick;
uniform float uPpqn;
uniform float uNearBoardZ;

float tickToZ(float tick) {
  return uNearBoardZ - ((tick - uCameraTick) / uPpqn) * 3.0;
}

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
  #ifdef USE_TICK_SCROLL
    worldPosition.z += tickToZ(aStartTick);
  #endif
  #ifdef USE_TAIL_TICK_SCROLL
    worldPosition.z = mix(
      tickToZ(aTickRange.y),
      tickToZ(aTickRange.x),
      vUv.y
    );
  #endif
  vWorldZ = worldPosition.z;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
