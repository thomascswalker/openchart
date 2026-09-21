precision mediump float;

uniform sampler2D uBaseTexture;
uniform vec3 uBaseColor;
uniform vec3 uBaseIntensity;

uniform sampler2D uEmissionTexture;
uniform vec3 uEmissionColor;
uniform float uEmissionIntensity;

uniform float uAlpha;
uniform float uSelected;
uniform float uGhost;
uniform float uTintEnabled;

varying vec2 vUv;

void main() {
  vec4 base = texture2D(uBaseTexture, vUv);

  // Apply color tint and ghost effect
  vec3 tint = mix(uBaseColor, vec3(1.0), uSelected);
  vec3 ghost = mix(tint, vec3(1.0), uGhost);

  vec3 emission =
    texture2D(uEmissionTexture, vUv).rgb * uEmissionColor * uEmissionIntensity;
  float alpha = base.a * uAlpha * (1.0 - uGhost * 0.55);
  if (alpha < 0.02) {
    discard;
  }
  vec3 composed = base.rgb * mix(vec3(1.0), ghost, uTintEnabled) + emission;
  gl_FragColor = vec4(composed, alpha);
}
