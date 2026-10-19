import { Vector2 } from "three";

/** Values of `PointerEvent.button`, plus `None` for "no button pressed". */
export const PointerButton = {
  None: -1,
  Left: 0,
  Middle: 1,
  Right: 2,
  Back: 3,
  Forward: 4,
} as const;

/** Union of the numeric values in {@link PointerButton}. */
export type PointerButton = (typeof PointerButton)[keyof typeof PointerButton];

/** Shared state of the pointer gesture currently in progress, if any. */
export class PointerContext {
  /** Id of the captured pointer, or null when no gesture is active. */
  id: number | null = null;

  /** Button that started the active gesture, or null when none is active. */
  button: PointerButton | null = null;

  /** Last known position of the active pointer, in canvas pixels. */
  position = new Vector2();
}
