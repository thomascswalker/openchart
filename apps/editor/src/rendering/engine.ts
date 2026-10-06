import * as THREE from "three";

export interface EngineOptions {
  background?: number;
  antialias?: boolean;
  pixelRatioCap?: number;
}

export class Engine {
  public readonly renderer: THREE.WebGLRenderer;
  public readonly canvas: HTMLCanvasElement;

  private width = 1;
  private height = 1;
  private readonly pixelRatioCap: number;
  private disposed = false;

  public constructor(options: EngineOptions = {}) {
    this.pixelRatioCap = options.pixelRatioCap ?? 2;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.canvas = this.renderer.domElement;
    this.canvas.style.display = "block";
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.canvas.style.touchAction = "none";

    this.renderer.setClearColor(options.background ?? 0x151515, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.debug.checkShaderErrors = true;
    this.setSize(1, 1);
  }

  public getSize(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  public setSize(width: number, height: number): void {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    const pixelRatio = Math.min(
      typeof window === "undefined" ? 1 : window.devicePixelRatio || 1,
      this.pixelRatioCap,
    );
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(this.width, this.height, false);
  }

  public render(scene: THREE.Scene, camera: THREE.Camera): void {
    if (!this.disposed) {
      scene.updateMatrixWorld(true);
      camera.updateMatrixWorld(true);
      const captureDiagnostics =
        typeof window !== "undefined" &&
        (window as Window & { __captureThreeFramebuffer?: boolean })
          .__captureThreeFramebuffer;
      this.renderer.setRenderTarget(null);
      this.renderer.render(scene, camera);
      if (!captureDiagnostics) {
        return;
      }
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
      this.canvas.dataset.threeSceneChildren = String(scene.children.length);
      this.canvas.dataset.threeVisibleNotes = String(
        scene.userData.visibleNotes ?? 0,
      );
      this.canvas.dataset.threeVisibleSustains = String(
        scene.userData.visibleSustains ?? 0,
      );
      this.canvas.dataset.threeContextType = this.renderer.capabilities.isWebGL2
        ? "webgl2"
        : "webgl";
      this.canvas.dataset.threeContextAttributes = JSON.stringify(
        gl.getContextAttributes(),
      );
      this.canvas.dataset.threePixel = JSON.stringify([...pixels]);
      this.canvas.dataset.threeFramebuffer = String(
        gl.getParameter(gl.FRAMEBUFFER_BINDING),
      );
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
        (
          window as Window & { __threeFramebufferPng?: string }
        ).__threeFramebufferPng = capture.toDataURL();
      }
      this.canvas.dataset.threeGlError = String(gl.getError());
      this.canvas.dataset.threeRenderCalls = String(
        this.renderer.info.render.calls,
      );
      this.canvas.dataset.threeRenderTriangles = String(
        this.renderer.info.render.triangles,
      );
      this.canvas.dataset.threeGeometryCount = String(
        this.renderer.info.memory.geometries,
      );
      this.canvas.dataset.threeTextureCount = String(
        this.renderer.info.memory.textures,
      );
      let sceneObjectCount = 0;
      scene.traverse(() => {
        sceneObjectCount += 1;
      });
      this.canvas.dataset.threeSceneObjects = String(sceneObjectCount);
      this.canvas.dataset.threeHighwayDrawMs = String(
        scene.userData.highwayDrawMs ?? 0,
      );
      this.canvas.dataset.threeInstancedNoteCounts = JSON.stringify(
        scene.userData.instancedNoteCounts ?? {},
      );
      this.canvas.dataset.threeDroppedNotes = String(
        scene.userData.droppedNotes ?? 0,
      );
      this.canvas.dataset.threeDroppedSustains = String(
        scene.userData.droppedSustains ?? 0,
      );
      this.canvas.dataset.threeBatchCapacities = JSON.stringify(
        scene.userData.batchCapacities ?? {},
      );
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
}

export function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }

    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : mesh.material
        ? [mesh.material]
        : [];
    materials.forEach((material) => {
      material.dispose();
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) {
          value.dispose();
        }
      }
    });
  });
}
