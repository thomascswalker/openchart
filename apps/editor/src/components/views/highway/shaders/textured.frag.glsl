precision mediump float;

uniform sampler2D uBaseTexture;
uniform sampler2D uEmissionTexture;
uniform vec3 uBaseColor;
uniform vec3 uEmissionColor;
uniform float uEmissionIntensity;
uniform float uAlpha;
uniform float uSelected;
uniform float uGhost;
uniform float uTintEnabled;
uniform float uPassed;
uniform float uUseStrikeLine;
uniform float uStrikeLineZ;
uniform float uPreserveWhiteCenter;

varying vec2 vUv;
varying float vWorldZ;

void main() {
  vec4 baseSample = texture2D(uBaseTexture, vUv);
  vec3 laneTint = mix(uBaseColor, vec3(1.0), uSelected * 0.35);
  vec3 ghostTint = mix(laneTint, vec3(0.82, 0.88, 1.0), uGhost);
  vec3 emission = texture2D(uEmissionTexture, vUv).rgb * uEmissionColor * uEmissionIntensity;
  float alpha = baseSample.a * uAlpha * (1.0 - uGhost * 0.55);
  if (alpha < 0.02) {
    discard;
  }
  vec3 composed = baseSample.rgb * mix(vec3(1.0), ghostTint, uTintEnabled) + emission;
  float centerMask = 1.0 - step(0.22, distance(vUv, vec2(0.5)));
  composed = mix(composed, baseSample.rgb, centerMask * uPreserveWhiteCenter);
  float passed = max(uPassed, step(uStrikeLineZ, vWorldZ) * uUseStrikeLine);
  float luminance = dot(composed, vec3(0.2126, 0.7152, 0.0722));
  gl_FragColor = vec4(mix(composed, vec3(luminance), passed), alpha);
}
