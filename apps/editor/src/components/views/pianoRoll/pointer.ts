import { Point } from "pixi.js";

export const PointerButton = {
  None: -1,
  Left: 0,
  Middle: 1,
  Right: 2,
  Back: 3,
  Forward: 4,
} as const;

export type PointerButton = (typeof PointerButton)[keyof typeof PointerButton];

export class PointerContext {
  id: number | null = null;
  button: PointerButton | null = null;
  position: Point = new Point(0, 0);
}
