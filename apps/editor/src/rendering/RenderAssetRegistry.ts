import { Assets, Texture } from "pixi.js";
import { Model, type Container3D } from "pixi3d/pixi7";
import {
  circularHighwayAssets,
  circularHighwayPrimitiveRoles,
  type CircularHighwayTextures,
} from "../assets/highway/circular";

export interface HighwayAssetBundle {
  fretTop: Model;
  fretBase: Model;
  note: Model;
  textures: CircularHighwayTextures;
}

export class RenderAssetLoadError extends Error {
  public readonly cause?: any;

  public constructor(message: string, cause?: any) {
    super(message);
    this.cause = cause;
    this.name = "RenderAssetLoadError";
  }
}

/** Application-lifetime owner for immutable rendering templates and textures. */
export class RenderAssetRegistry {
  private highwayPromise: Promise<HighwayAssetBundle> | null = null;
  private highwayBundle: HighwayAssetBundle | null = null;
  private disposed = false;

  public preloadHighway(): Promise<HighwayAssetBundle> {
    if (this.disposed) {
      return Promise.reject(
        new RenderAssetLoadError("Asset registry disposed"),
      );
    }
    if (this.highwayPromise) {
      return this.highwayPromise;
    }

    this.highwayPromise = Promise.all([
      Assets.load(circularHighwayAssets.fretTopModel),
      Assets.load(circularHighwayAssets.fretBaseModel),
      Assets.load(circularHighwayAssets.noteModel),
      this.loadTextures(),
    ])
      .then(([fretTopSource, fretBaseSource, noteSource, textures]) => {
        if (this.disposed) {
          throw new RenderAssetLoadError("Asset registry disposed during load");
        }
        const bundle = {
          fretTop: Model.from(fretTopSource),
          fretBase: Model.from(fretBaseSource),
          note: Model.from(noteSource),
          textures,
        };
        this.validatePrimitiveRoles(bundle);
        this.highwayBundle = bundle;
        return bundle;
      })
      .catch((cause) => {
        this.highwayPromise = null;
        if (cause instanceof RenderAssetLoadError) {
          throw cause;
        }
        throw new RenderAssetLoadError(
          "Unable to load circular highway assets",
          cause,
        );
      });

    return this.highwayPromise;
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    const bundle = this.highwayBundle;
    this.highwayBundle = null;
    this.highwayPromise = null;
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

  private validatePrimitiveRoles(bundle: HighwayAssetBundle): void {
    const expected = [
      [bundle.note, circularHighwayPrimitiveRoles.note, "highway.note"],
      [
        bundle.fretTop,
        circularHighwayPrimitiveRoles.fretTop,
        "highway.fretTop",
      ],
      [
        bundle.fretBase,
        circularHighwayPrimitiveRoles.fretBase,
        "highway.fretBase",
      ],
    ] as const;
    for (const [model, roles, id] of expected) {
      const candidate = model as unknown as { meshes?: unknown[] };
      const meshes = candidate.meshes?.length ?? model.children.length;
      if (meshes > 0 && meshes !== roles.length) {
        throw new RenderAssetLoadError(
          `${id} primitive count ${meshes} does not match manifest role count ${roles.length}`,
        );
      }
    }
  }
}

function destroyContainer(container: Container3D): void {
  container.destroy({ children: true } as never);
}
