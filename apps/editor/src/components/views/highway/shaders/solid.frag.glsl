precision mediump float;

uniform vec3 uBaseColor;
uniform float uAlpha;
uniform float uSelected;
uniform float uGhost;
uniform float uPassed;
uniform float uUseStrikeLine;
uniform float uStrikeLineZ;
varying float vWorldZ;
#ifdef USE_INSTANCE_STATE
varying vec4 vLaneColorSelected;
#endif

void main() {
  vec3 baseColor = uBaseColor;
  float selected = uSelected;
  #ifdef USE_INSTANCE_STATE
    baseColor = vLaneColorSelected.rgb;
    selected = vLaneColorSelected.a;
  #endif
  vec3 laneTint = mix(baseColor, vec3(1.0), selected * 0.35);
  vec3 ghostTint = mix(laneTint, vec3(0.82, 0.88, 1.0), uGhost);
  float alpha = uAlpha * (1.0 - uGhost * 0.55);
  if (alpha < 0.02) {
    discard;
  }
  float passed = max(uPassed, step(uStrikeLineZ, vWorldZ) * uUseStrikeLine);
  float luminance = dot(ghostTint, vec3(0.2126, 0.7152, 0.0722));
  gl_FragColor = vec4(mix(ghostTint, vec3(luminance), passed), alpha);
}
