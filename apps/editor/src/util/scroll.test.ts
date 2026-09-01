import { expect, test } from "vitest";
import { getScrollGesture, type WheelInput } from "./scroll";

function wheelInput(overrides: Partial<WheelInput> = {}): WheelInput {
  return {
    deltaMode: 0,
    deltaX: 0,
    deltaY: 0,
    ctrlKey: false,
    metaKey: false,
    ...overrides,
  };
}

test("classifies line-mode wheel input as mouse zoom", () => {
  expect(getScrollGesture(wheelInput({ deltaMode: 1, ctrlKey: true }))).toBe(
    "mouse-zoom",
  );
});

test("classifies standard mouse wheel steps as mouse zoom", () => {
  expect(getScrollGesture(wheelInput({ deltaY: 120 }))).toBe("mouse-zoom");
  expect(getScrollGesture(wheelInput({ deltaX: 120 }))).toBe("mouse-zoom");
});

test("classifies fractional and two-axis pixel deltas as trackpad pan", () => {
  expect(getScrollGesture(wheelInput({ deltaY: 12.5 }))).toBe("trackpad-pan");
  expect(getScrollGesture(wheelInput({ deltaX: 15, deltaY: -8 }))).toBe(
    "trackpad-pan",
  );
});

test("classifies Ctrl or Meta pixel-mode wheel input as trackpad pinch", () => {
  expect(getScrollGesture(wheelInput({ deltaY: -20, ctrlKey: true }))).toBe(
    "trackpad-pinch",
  );
  expect(getScrollGesture(wheelInput({ deltaY: -20, metaKey: true }))).toBe(
    "trackpad-pinch",
  );
});
