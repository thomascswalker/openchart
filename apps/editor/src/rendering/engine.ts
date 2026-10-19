import * as THREE from "three";

declare global {
  interface Window {
    __captureFramebuffer?: boolean;
    __framebufferPng?: string;
  }
}

export interface EngineOptions {
  background: number;
  antialias: boolean;
  pixelRatioCap: number;
}

const defaultEngineOptions: EngineOptions = {
  background: 0x151515,
  antialias: true,
  pixelRatioCap: 2,
};

// Dataset for storing diagnostic information about the rendering engine
interface CanvasDataset extends DOMStringMap {
  /* Children of the scene */
  sceneChildren: string;
  /* Number of visible notes in the scene */
  visibleNotes: string;
  /* Number of visible sustains in the scene */
  visibleSustains: string;
  /* WebGL context type */
  contextType: string;
  /* WebGL context attributes */
  contextAttributes: string;
  /* Pixel information */
  pixel: string;
  /* Framebuffer information */
  framebuffer: string;
  /* Last WebGL error */
  glError: string;
  /* Number of render calls */
  renderCalls: string;
  /* Number of rendered triangles */
  renderTriangles: string;
  /* Number of geometries */
  geometryCount: string;
  /* Number of textures */
  textureCount: string;
  /* Number of objects in the scene */
  sceneObjects: string;
  /* Time spent drawing the highway (ms) */
  highwayDrawMs: string;
  /* Time spent writing instance buffers (ms) */
  instanceBufferWriteMs: string;
  /* Flag indicating if the note batch is dirty */
  noteBatchDirty: string;
  /* Counts of instanced notes */
  instancedNoteCounts: string;
  /* Number of dropped notes */
  droppedNotes: string;
  /* Number of dropped sustains */
  droppedSustains: string;
  /* Capacities of various batches */
  batchCapacities: string;
}

/* Thin wrapper around the WebGL rendering engine */
export class Engine {
  // WebGL rendering engine instance
  public readonly renderer: THREE.WebGLRenderer;
  // Canvas element associated with the renderer
  public readonly canvas: HTMLCanvasElement;
  // Current width of the rendering canvas
  private width = 1;
  // Current height of the rendering canvas
  private height = 1;
  // Maximum allowed device pixel ratio
  private readonly pixelRatioCap: number;
  // Flag indicating whether the engine has been disposed
  private disposed = false;

  public constructor({ background, antialias, pixelRatioCap }: EngineOptions) {
    // Merge the provided options with the default options
    background = background ?? defaultEngineOptions.background;
    antialias = antialias ?? defaultEngineOptions.antialias;
    this.pixelRatioCap = pixelRatioCap ?? defaultEngineOptions.pixelRatioCap;

    // Create the WebGL renderer instance
    this.renderer = new THREE.WebGLRenderer({
      antialias: antialias,
      alpha: false,
      powerPreference: "high-performance",
    });

    // Extract the canvas element from the renderer and set its default style
    this.canvas = this.renderer.domElement;
    this.canvas.style.display = "block";
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.canvas.style.touchAction = "none";

    // Set the clear color and other renderer properties
    this.renderer.setClearColor(background, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.debug.checkShaderErrors = true;

    // Set the initial size of the renderer and canvas to [1,1] so that
    // it has a valid size immediately
    this.size = { width: 1, height: 1 };
  }

  public get size(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  public set size(value: { width: number; height: number }) {
    this.width = Math.max(1, Math.floor(value.width));
    this.height = Math.max(1, Math.floor(value.height));
    const pixelRatio = Math.min(
      typeof window === "undefined" ? 1 : window.devicePixelRatio || 1,
      this.pixelRatioCap,
    );
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(this.width, this.height, false);
  }

  public render(scene: THREE.Scene, camera: THREE.Camera): void {
    // Don't render if the engine has been disposed
    if (this.disposed) {
      return;
    }

    // Update scene and camera matrices
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);

    // Set the render target to null to render to the default framebuffer
    this.renderer.setRenderTarget(null);

    // Render the frame
    this.renderer.render(scene, camera);

    // Optionally capture diagnostic data
    const captureDiagnostics =
      typeof window !== "undefined" && window.__captureFramebuffer;
    if (captureDiagnostics) {
      this.captureDiagnostics(scene);
    }
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.renderer.renderLists.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }

  public captureDiagnostics(scene: THREE.Scene): void {
    this.renderer.setRenderTarget(null);
    const gl = this.renderer.getContext();
    const pixels = new Uint8Array(4);
    gl.readPixels(
      Math.floor(gl.drawingBufferWidth / 2),
      Math.floor(gl.drawingBufferHeight / 2),
      1,
      1,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels,
    );

    const dataset: CanvasDataset = this.canvas.dataset as CanvasDataset;

    dataset.sceneChildren = String(scene.children.length);
    dataset.visibleNotes = String(scene.userData.visibleNotes ?? 0);
    dataset.visibleSustains = String(scene.userData.visibleSustains ?? 0);
    dataset.contextType = this.renderer.capabilities.isWebGL2
      ? "webgl2"
      : "webgl";
    dataset.contextAttributes = JSON.stringify(gl.getContextAttributes());
    dataset.pixel = JSON.stringify([...pixels]);
    dataset.framebuffer = String(gl.getParameter(gl.FRAMEBUFFER_BINDING));
    const framebufferPixels = new Uint8Array(
      gl.drawingBufferWidth * gl.drawingBufferHeight * 4,
    );
    gl.readPixels(
      0,
      0,
      gl.drawingBufferWidth,
      gl.drawingBufferHeight,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      framebufferPixels,
    );
    const capture = document.createElement("canvas");
    capture.width = gl.drawingBufferWidth;
    capture.height = gl.drawingBufferHeight;
    const captureContext = capture.getContext("2d");
    if (captureContext) {
      const image = captureContext.createImageData(
        gl.drawingBufferWidth,
        gl.drawingBufferHeight,
      );
      const rowLength = gl.drawingBufferWidth * 4;
      for (let row = 0; row < gl.drawingBufferHeight; row += 1) {
        const source = (gl.drawingBufferHeight - row - 1) * rowLength;
        const target = row * rowLength;
        image.data.set(
          framebufferPixels.subarray(source, source + rowLength),
          target,
        );
      }
      captureContext.putImageData(image, 0, 0);
      window.__framebufferPng = capture.toDataURL();
    }
    dataset.glError = String(gl.getError());
    dataset.renderCalls = String(this.renderer.info.render.calls);
    dataset.renderTriangles = String(this.renderer.info.render.triangles);
    dataset.geometryCount = String(this.renderer.info.memory.geometries);
    dataset.textureCount = String(this.renderer.info.memory.textures);
    let sceneObjectCount = 0;
    scene.traverse(() => {
      sceneObjectCount += 1;
    });
    dataset.sceneObjects = String(sceneObjectCount);
    dataset.highwayDrawMs = String(scene.userData.highwayDrawMs ?? 0);
    dataset.instanceBufferWriteMs = String(
      scene.userData.instanceBufferWriteMs ?? 0,
    );
    dataset.noteBatchDirty = String(scene.userData.noteBatchDirty ?? false);
    dataset.instancedNoteCounts = JSON.stringify(
      scene.userData.instancedNoteCounts ?? {},
    );
    dataset.droppedNotes = String(scene.userData.droppedNotes ?? 0);
    dataset.droppedSustains = String(scene.userData.droppedSustains ?? 0);
    dataset.batchCapacities = JSON.stringify(
      scene.userData.batchCapacities ?? {},
    );
  }
}
