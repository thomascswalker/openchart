import * as THREE from "three";

export interface ThreeRenderEngineOptions {
  background?: number;
  antialias?: boolean;
  pixelRatioCap?: number;
}

/**
 * Owns the Three renderer and its canvas. Views own scenes and cameras, while
 * this class owns renderer configuration, resize, render, and GPU teardown.
 */
export class ThreeRenderEngine {
  public readonly renderer: THREE.WebGLRenderer;
  public readonly canvas: HTMLCanvasElement;

  private width = 1;
  private height = 1;
  private readonly pixelRatioCap: number;
  private disposed = false;

  public constructor(options: ThreeRenderEngineOptions = {}) {
    this.pixelRatioCap = options.pixelRatioCap ?? 2;
    this.renderer = new THREE.WebGLRenderer({
      antialias: options.antialias ?? true,
      alpha: false,
      preserveDrawingBuffer: true,
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
      this.renderer.render(scene, camera);
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
