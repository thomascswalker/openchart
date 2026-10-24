varying vec2 vUv;
varying float vWorldZ;
#ifdef USE_INSTANCE_STATE
attribute vec4 aLaneColorSelected;
varying vec4 vLaneColorSelected;
#endif
#ifdef USE_NOTE_FLAGS
attribute vec2 aNoteFlags;
varying vec2 vNoteFlags;
varying vec3 vViewNormal;
varying vec3 vViewPosition;
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
uniform float uScrollSpeed;

float tickToZ(float tick) {
  return uNearBoardZ - ((tick - uCameraTick) / uPpqn) * 3.0 * uScrollSpeed;
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
  #ifdef USE_NOTE_FLAGS
    vNoteFlags = aNoteFlags;
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
  #ifdef USE_NOTE_FLAGS
    vec4 viewPosition = viewMatrix * worldPosition;
    vViewNormal = normalize(mat3(viewMatrix * model) * normal);
    vViewPosition = viewPosition.xyz;
  #endif
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
