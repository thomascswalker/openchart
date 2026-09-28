import * as THREE from "three";
import type { HighwayContext } from "./context";
import { laneCount, strikeLineZ } from "./constants";

type HighwayCoordinateContext = Pick<
  HighwayContext,
  "getCanvas" | "getPlayheadTick" | "getPpqn" | "getState" | "getViewport"
>;

/** Perspective-camera lane, depth, and screen coordinate conversions. */
export class HighwayCoordinateSystem {
  private readonly context: HighwayCoordinateContext;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly raycaster = new THREE.Raycaster();
  private readonly boardPlane = new THREE.Plane(
    new THREE.Vector3(0, 1, 0),
    -0.05,
  );

  public constructor(
    context: HighwayCoordinateContext,
    camera: THREE.PerspectiveCamera,
  ) {
    this.context = context;
    this.camera = camera;
  }

  public getCanvasPoint(event: MouseEvent): { x: number; y: number } | null {
    const canvas = this.context.getCanvas();
    if (!canvas) return null;
    const bounds = canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return null;
    const viewport = this.context.getViewport();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * viewport.width,
      y: ((event.clientY - bounds.top) / bounds.height) * viewport.height,
    };
  }

  public getChartLocation(
    event: MouseEvent,
  ): { lane: number; tick: number } | null {
    const canvas = this.context.getCanvas();
    if (!this.getCanvasPoint(event) || !canvas) return null;
    const bounds = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.boardPlane, hit)) return null;
    const lane = Math.max(
      0,
      Math.min(laneCount - 1, Math.floor((hit.x + 3) / (6 / laneCount))),
    );
    const tick = this.snapTick(
      this.context.getPlayheadTick() +
        ((strikeLineZ - hit.z) / 3) * this.context.getPpqn(),
    );
    return { lane, tick };
  }

  public worldToScreen(position: THREE.Vector3): THREE.Vector2 | null {
    if (!this.context.getCanvas()) return null;
    const viewport = this.context.getViewport();
    const projected = position.clone().project(this.camera);
    return new THREE.Vector2(
      (projected.x + 1) * 0.5 * viewport.width,
      (1 - projected.y) * 0.5 * viewport.height,
    );
  }

  public screenToWorld(x: number, y: number): THREE.Vector3 | null {
    if (!this.context.getCanvas()) return null;
    const viewport = this.context.getViewport();
    this.raycaster.setFromCamera(
      new THREE.Vector2(
        (x / viewport.width) * 2 - 1,
        -(y / viewport.height) * 2 + 1,
      ),
      this.camera,
    );
    const hit = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.boardPlane, hit) ? hit : null;
  }

  public getLaneX(lane: number): number {
    return -2.4 + (4.8 * lane) / (laneCount - 1);
  }

  public getNoteZ(tick: number): number {
    return (
      strikeLineZ -
      ((tick - this.context.getPlayheadTick()) / this.context.getPpqn()) * 3
    );
  }

  public getTickAtDepth(z: number): number {
    return (
      this.context.getPlayheadTick() +
      ((strikeLineZ - z) / 3) * this.context.getPpqn()
    );
  }

  public getSnapTicks(): number {
    return (
      (this.context.getPpqn() * 4) / this.context.getState().snap.denominator
    );
  }

  public snapTick(tick: number): number {
    const state = this.context.getState();
    if (!state.snap.enabled) return Math.max(0, Math.round(tick));
    const snapTicks = this.getSnapTicks();
    return snapTicks > 0
      ? Math.max(0, Math.floor(tick / snapTicks) * snapTicks)
      : Math.max(0, Math.round(tick));
  }
}
