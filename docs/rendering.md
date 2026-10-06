
# Rendering

## Views
 
Each `ChartViewHost` creates its own `Engine` (and thus its own `THREE.WebGLRenderer`/WebGL context). With up 
to four viewports, up to four contexts coexist. Assets are shared via the module-level `ResourceRegistry`.

```mermaid
graph TD
    subgraph UI["UI (React)"]
        HOSTC["ChartViewHost"] ---> ACV
        ACV ---> CANVAS["`Canvas (_div_)`"]
    end
 
    subgraph RENDER["Rendering  (Three.js)"]
        ACV["<b>AbstractChartView</b><br/>template-method base"]
        ENG["<b>Engine</b><br/>WebGLRenderer + canvas"]
        SCHED["<b>Render Scheduler</b><br/>Collapse frame requests into a single draw call"]
        subgraph VIEW["View"]
          PRR["<b>Piano Roll (Orthographic)</b><br/>Scene rebuilt each draw"]
          HWR["<b>Highway (Perspective)</b><br/>Persistent scene via object pools"]
        end
    end
 
    RENDER ---> ACV
```

## 2D Rendering

TODO

## 3D Rendering

All assets are bundler-resolved (nothing is fetched at runtime). As a result, validation is strict and 
explicit upon compilation rather than at runtime. All assets are stored in a global registry.

A 3D asset consists of the approximate below file structure:

```
defs.json           # Declarative definition referencing these files
<type>/<type>.glb   # Mesh
<type>/<type>_D.png # Diffuse texture
<type>/<type>_E.png # Emissive texture
<type>/<type>_M.png # Emissive mask texture
```

`defs.json` is single JSON file (`apps/editor/src/assets/defs.json`) which defines 
the different note and material permutations.

```jsonc
{
  "meshes": {
    "<name>": {                       // Mesh identifier
      "root": "string",               // Root directory the remaining properties build a path from
      "mesh": "string",               // .glb file
      "material": "string",           // Material name (from "materials")
      "materialIds": "string[]",      // Expected material IDs in the GLB mesh
      "tintedMaterialIds": "string[]" // Material IDs which receive a color tint
    },
    // Other meshes
  },
  "materials": {
    "<name>": {                       // Material identifier
      "vert": "vert.glsl",            // Vertex shader file
      "pixel": "note.frag.glsl",      // Pixel shader file
      "properties": {                 // Material properties
        "emissionTex": "string",
        "emissionMaskTex": "string",
        // Other properties
      }
    },
    // Other materials
  },
  "unusedAssets": {
    "Round/RoundNote_E2.png": "Unused"
    // Other unused assets
  }
}
```

### Geometry

All geometry is in .glb (GLTF) format. Meshes are shared by reference from the registry. 


#### Definitions

The semantic mapping of different note types to an explicit mesh/material combo is handled by the geometry 
catalog. The catalog is backed by `defs.json`.
