precision mediump float;

uniform sampler2D uBaseTexture;
uniform vec3 uBaseColor;
uniform vec3 uBaseIntensity;

uniform sampler2D uEmissionTexture;
uniform sampler2D uEmissionMaskTexture;
uniform vec3 uEmissionColor;
uniform float uEmissionIntensity;

uniform float uAlpha;
uniform float uSelected;
uniform float uGhost;
uniform float uTintEnabled;

varying vec2 vUv;
#ifdef USE_INSTANCE_STATE
varying vec4 vLaneColorSelected;
#endif

// Leaves values below the knee untouched; compresses the excess above it toward 1.0 instead of hard-clipping.
vec3 softKnee(vec3 color, float knee) {
  vec3 excess = max(color - knee, 0.0);
  return color - excess + excess / (1.0 + excess);
}

void main() {

  vec4 base = texture2D(uBaseTexture, vUv);
  vec3 baseColor = uBaseColor;
  vec3 emissionTint = uEmissionColor;
  float selected = uSelected;
  #ifdef USE_INSTANCE_STATE
    baseColor = vLaneColorSelected.rgb;
    emissionTint = vLaneColorSelected.rgb;
    selected = vLaneColorSelected.a;
  #endif

  // Apply selection/ghost effect
  vec3 outColor = baseColor;
  outColor = mix(outColor, vec3(1.0), selected);
  outColor = mix(outColor, vec3(1.0), uGhost);

  // Compute note color via emission
  float emissionMask = texture2D(uEmissionMaskTexture, vUv).r;
  vec3 emissionColor = mix(vec3(1.0), emissionTint, emissionMask);
  vec3 emission =
    texture2D(uEmissionTexture, vUv).rgb * emissionColor * uEmissionIntensity;
  
  float alpha = base.a * uAlpha * (1.0 - uGhost * 0.55);
  if (alpha < 0.02) {
    discard;
  }

  // Apply emission
  outColor = base.rgb * mix(vec3(0.0), outColor, uTintEnabled) + emission;
  gl_FragColor = vec4(softKnee(outColor, 0.7), alpha);
}
