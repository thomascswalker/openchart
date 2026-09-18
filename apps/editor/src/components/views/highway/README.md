# Circular highway renderer

The renderer is implemented in six stages:

1. `src/assets/highway/circular/source` preserves the supplied FBX/PNG files.
   `tools/highway/prepare-highway-assets.py` converts the three FBX files to
   checked-in, self-contained GLBs and writes `runtime/manifest.json` with
   geometry, material, UV, normal, coordinate-system, and pivot checks.
   Runtime code loads those checked-in GLBs directly; conversion is never run
   by Vite, the browser, or the Tauri webview.
2. `circularMaterials.ts` ports the YARG Circular material inputs to a
   Pixi3D `Material.from(vertexSource, fragmentSource, updateUniforms)` shader.
   Base textures are lane-tinted; emission masks are multiplied by emission
   color/intensity; alpha is clipped at the transparent edge; selected and
   ghost states are uniforms rather than mesh replacement.
3. `RenderAssetRegistry` owns application-lifetime templates and textures;
   views create only their own materials and pooled instances. The geometry
   catalog keeps local transforms and depth layers in one place.
4. `index.ts` keeps the existing tick-to-depth mapping and visible temporal
   window while using imported fret assemblies and role-aware note instances.
   Sustains remain procedural quads, are submitted before note heads, and keep
   their passed segment for shader grayscale conversion.
5. Interaction bounds are projected from the calibrated imported note bounds;
   the active ChartView, instrument/difficulty selection, and playback
   feedback path are unchanged. Asset loading is generation-safe across view
   destruction/recreation.
6. Focused tests cover the manifest, material state contract, timing geometry,
   sustain placement, note calibration/size controls, keyed generic pooling,
   and visibility-window pooling. `AbstractChartView` coalesces render
   requests so playback and ghost movement produce at most one draw per frame.

Run the asset preparation step from the repository root with:

```sh
npm run prepare:highway-assets
```

The original YARG Circular material reference is:

<https://github.com/YARC-Official/YARG/tree/master/Assets/Art/Materials/Gameplay/Notes>
