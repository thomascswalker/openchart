precision mediump float;

// Textures and colors used by the note's base and emissive materials.
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

// Tap-note tint and Fresnel transparency tuning.
const vec3 TAP_TINT_COLOR = vec3(0.5, 0.0, 1.0);
const float TAP_TINT_STRENGTH = 0.5;
const float TAP_FRESNEL_POWER = 2.0;
const float TAP_OPACITY_START = 0.02;
const float TAP_OPACITY_END = 0.18;

// HOPO-note white core and glow tuning in UV-space radii.
const float HOPO_CORE_START_RADIUS = 0.07;
const float HOPO_CORE_END_RADIUS = 0.2;
const float HOPO_CORE_STRENGTH = 0.85;
const float HOPO_GLOW_START_RADIUS = 0.15;
const float HOPO_GLOW_END_RADIUS = 0.35;
const float HOPO_GLOW_STRENGTH = 0.85;

// Per-fragment inputs from the vertex shader.
varying vec2 vUv;
#ifdef USE_INSTANCE_STATE
varying vec4 vLaneColorSelected;
#endif
#ifdef USE_NOTE_FLAGS
varying vec2 vNoteFlags; // x = HOPO, y = Tap
varying vec3 vViewNormal;
varying vec3 vViewPosition;
#endif

// Compresses bright values above the knee toward 1.0 without hard clipping.
vec3 softKnee(vec3 color, float knee) {
  vec3 excess = max(color - knee, 0.0);
  return color - excess + excess / (1.0 + excess);
}

void main() {
  // Sample the base material and resolve per-instance lane color and selection.
  vec4 base = texture2D(uBaseTexture, vUv);
  vec3 baseColor = uBaseColor;
  vec3 emissionTint = uEmissionColor;
  float selected = uSelected;
  #ifdef USE_INSTANCE_STATE
    baseColor = vLaneColorSelected.rgb;
    emissionTint = vLaneColorSelected.rgb;
    selected = vLaneColorSelected.a;
  #endif

  // Selection and ghost notes are brightened toward white.
  vec3 outColor = baseColor;
  outColor = mix(outColor, vec3(1.0), selected);
  outColor = mix(outColor, vec3(1.0), uGhost);

  // Tint the emissive texture with the lane color where the mask allows it.
  float emissionMask = texture2D(uEmissionMaskTexture, vUv).r;
  vec3 emissionColor = mix(vec3(1.0), emissionTint, emissionMask);
  vec3 emission =
    texture2D(uEmissionTexture, vUv).rgb * emissionColor * uEmissionIntensity;

  // Apply note and ghost opacity, then skip fragments that are effectively invisible.
  float alpha = base.a * uAlpha * (1.0 - uGhost * 0.55);
  if (alpha < 0.02) {
    discard;
  }

  // Combine the base texture, optional lane tint, and emissive contribution.
  outColor = base.rgb * mix(vec3(0.0), outColor, uTintEnabled) + emission;

#ifdef USE_NOTE_FLAGS
  // Tap notes receive a 50% purple tint.
  outColor = mix(
    outColor,
    TAP_TINT_COLOR,
    TAP_TINT_STRENGTH * vNoteFlags.y
  );

  // Fresnel fades the Tap note's center while preserving its visible rim.
  float fresnel = pow(
    1.0 - abs(dot(normalize(vViewNormal), normalize(-vViewPosition))),
    TAP_FRESNEL_POWER
  );
  float tapOpacity = smoothstep(
    TAP_OPACITY_START,
    TAP_OPACITY_END,
    fresnel
  );
  alpha *= mix(1.0, tapOpacity, vNoteFlags.y);

  // HOPO notes get a white center and soft glow; Tap notes are excluded.
  float centerDistance = length(vUv - vec2(0.5));
  float centerCore = 1.0 - smoothstep(
    HOPO_CORE_START_RADIUS,
    HOPO_CORE_END_RADIUS,
    centerDistance
  );
  float centerGlow = 1.0 - smoothstep(
    HOPO_GLOW_START_RADIUS,
    HOPO_GLOW_END_RADIUS,
    centerDistance
  );
  float hopoCenter = clamp(
    (centerCore * HOPO_CORE_STRENGTH + centerGlow * HOPO_GLOW_STRENGTH) *
      vNoteFlags.x *
      (1.0 - vNoteFlags.y),
    0.0,
    1.0
  );
  outColor = mix(outColor, vec3(1.0), hopoCenter);
#endif

  // Apply the final highlight compression and output the shaded note.
  gl_FragColor = vec4(softKnee(outColor, 0.7), alpha);
}
