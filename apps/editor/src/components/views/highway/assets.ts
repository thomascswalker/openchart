import { Assets, Texture } from "pixi.js";
import { Model, type Container3D } from "pixi3d/pixi7";
import {
  circularHighwayAssets,
  type CircularHighwayTextures,
} from "../../../assets/highway/circular";

export interface HighwayAssetBundle {
  fretTop: Model;
  fretBase: Model;
  note: Model;
  textures: CircularHighwayTextures;
}

export class HighwayAssetLoadError extends Error {
  public constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "HighwayAssetLoadError";
  }
}

/**
 * Owns one generation of highway asset loading.  The generation token makes a
 * late Vite/Tauri promise unable to attach a model to a destroyed view.
 */
export class HighwayAssetStore {
  private generation = 0;
  private bundle: HighwayAssetBundle | null = null;

  public async load(): Promise<HighwayAssetBundle> {
    const generation = ++this.generation;
    try {
      // Runtime loading is intentionally GLB-only. FBX conversion belongs to
      // the offline prepare:highway-assets step; browser and Tauri never need
      // a Node-only converter or the source FBX files.
      const [fretTopSource, fretBaseSource, noteSource, textures] =
        await Promise.all([
          Assets.load(circularHighwayAssets.fretTopModel),
          Assets.load(circularHighwayAssets.fretBaseModel),
          Assets.load(circularHighwayAssets.noteModel),
          this.loadTextures(),
        ]);

      if (generation !== this.generation) {
        throw new HighwayAssetLoadError("Highway asset load became stale");
      }

      const bundle: HighwayAssetBundle = {
        fretTop: Model.from(fretTopSource),
        fretBase: Model.from(fretBaseSource),
        note: Model.from(noteSource),
        textures,
      };
      this.bundle = bundle;
      return bundle;
    } catch (cause) {
      if (cause instanceof HighwayAssetLoadError) {
        throw cause;
      }
      throw new HighwayAssetLoadError(
        "Unable to load circular highway assets",
        cause,
      );
    }
  }

  public isCurrent(): boolean {
    return this.generation > 0;
  }

  public dispose(): void {
    this.generation += 1;
    const bundle = this.bundle;
    this.bundle = null;
    if (!bundle) {
      return;
    }

    destroyContainer(bundle.fretTop);
    destroyContainer(bundle.fretBase);
    destroyContainer(bundle.note);
    Object.values(bundle.textures).forEach((texture) => texture.destroy(true));
  }

  private async loadTextures(): Promise<CircularHighwayTextures> {
    const [fret, note, noteEmission, sustain, sustainEmission] =
      await Promise.all([
        Texture.fromURL(circularHighwayAssets.fretTexture),
        Texture.fromURL(circularHighwayAssets.noteTexture),
        Texture.fromURL(circularHighwayAssets.noteEmissionTexture),
        Texture.fromURL(circularHighwayAssets.sustainTexture),
        Texture.fromURL(circularHighwayAssets.sustainEmissionTexture),
      ]);
    return { fret, note, noteEmission, sustain, sustainEmission };
  }
}

function destroyContainer(container: Container3D): void {
  container.destroy({ children: true } as never);
}
