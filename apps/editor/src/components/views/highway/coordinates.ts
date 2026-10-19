import { Vector2 } from "three";
import * as THREE from "three";
import type { HighwayContext } from "./context";
import { laneCount, nearBoardZ } from "./constants";
import { drumLaneCount } from "./drumProfile";

type HighwayCoordinateContext = Pick<
  HighwayContext,
  "getCameraTick" | "getCanvas" | "getPpqn" | "getState" | "getViewport"
> &
  Partial<Pick<HighwayContext, "getCurrentChart" | "getScrollSpeedMultiplier">>;

/** Perspective-camera lane, depth, and screen coordinate conversions. */
export class HighwayCoordinateSystem {
  private readonly context: HighwayCoordinateContext;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly raycaster = new THREE.Raycaster();
  private readonly boardPlane = new THREE.Plane(
    new THREE.Vector3(0, 1, 0),
    0.045,
  );

  public constructor(
    context: HighwayCoordinateContext,
    camera: THREE.PerspectiveCamera,
  ) {
    this.context = context;
    this.camera = camera;
  }

  public getCanvasPoint(event: MouseEvent): Vector2 | null {
    const canvas = this.context.getCanvas();
    if (!canvas) return null;
    const bounds = canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return null;
    const viewport = this.context.getViewport();
    return new Vector2(
      ((event.clientX - bounds.left) / bounds.width) * viewport.width,
      ((event.clientY - bounds.top) / bounds.height) * viewport.height,
    );
  }

  public getChartLocation(
    event: MouseEvent,
  ): { lane: number; tick: number } | null {
    const hit = this.getWorldLocation(event);
    if (!hit) return null;
    const laneCount = this.getPhysicalLaneCount();
    const lane = Math.max(
      0,
      Math.min(laneCount - 1, Math.floor((hit.x + 3) / (6 / laneCount))),
    );
    const tick = this.snapTick(this.getTickAtDepth(hit.z));
    return { lane, tick };
  }

  public getWorldLocation(event: MouseEvent): THREE.Vector3 | null {
    const canvas = this.context.getCanvas();
    if (!this.getCanvasPoint(event) || !canvas) return null;
    const bounds = canvas.getBoundingClientRect();
    const ndc = new Vector2(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.boardPlane, hit) ? hit : null;
  }

  public worldToScreen(position: THREE.Vector3): Vector2 | null {
    if (!this.context.getCanvas()) return null;
    const viewport = this.context.getViewport();
    const projected = position.clone().project(this.camera);
    return new Vector2(
      (projected.x + 1) * 0.5 * viewport.width,
      (1 - projected.y) * 0.5 * viewport.height,
    );
  }

  public screenToWorld(x: number, y: number): THREE.Vector3 | null {
    if (!this.context.getCanvas()) return null;
    const viewport = this.context.getViewport();
    this.raycaster.setFromCamera(
      new Vector2((x / viewport.width) * 2 - 1, -(y / viewport.height) * 2 + 1),
      this.camera,
    );
    const hit = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.boardPlane, hit) ? hit : null;
  }

  public getLaneX(lane: number): number {
    const laneCount = this.getPhysicalLaneCount();
    return -3 + ((lane + 0.5) * 6) / laneCount;
  }

  public getPhysicalLaneCount(): number {
    if (this.isDrumChart()) return drumLaneCount;
    return this.context.getCurrentChart?.()?.getLaneCount() ?? laneCount;
  }

  private isDrumChart(): boolean {
    return this.context.getState().selectedInstrument === "DRUMS";
  }

  public getNoteZ(tick: number): number {
    return (
      nearBoardZ -
      (((tick - this.context.getCameraTick()) *
        this.getScrollSpeedMultiplier()) /
        this.context.getPpqn()) *
        3
    );
  }

  public getTickAtDepth(z: number): number {
    return (
      this.context.getCameraTick() +
      (((nearBoardZ - z) / 3) * this.context.getPpqn()) /
        this.getScrollSpeedMultiplier()
    );
  }

  public getCameraTickAtDepth(tick: number, z: number): number {
    return (
      tick -
      (((nearBoardZ - z) / 3) * this.context.getPpqn()) /
        this.getScrollSpeedMultiplier()
    );
  }

  private getScrollSpeedMultiplier(): number {
    return this.context.getScrollSpeedMultiplier?.() ?? 1;
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
