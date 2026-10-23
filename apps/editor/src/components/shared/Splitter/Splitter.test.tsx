import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { Splitter } from "./Splitter";

function renderSplitter(orientation: "horizontal" | "vertical" = "horizontal") {
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(
      <Splitter orientation={orientation} initialSize={400}>
        <div>First pane</div>
        <div>Second pane</div>
      </Splitter>,
    );
  });
  const splitter = container.firstElementChild as HTMLDivElement;
  Object.defineProperty(splitter, "clientWidth", { value: 1000 });
  Object.defineProperty(splitter, "clientHeight", { value: 800 });
  splitter.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      right: 1000,
      bottom: 800,
      width: 1000,
      height: 800,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  const separator = container.querySelector('[role="separator"]')!;
  Object.defineProperty(separator, "setPointerCapture", { value: () => {} });
  Object.defineProperty(separator, "releasePointerCapture", {
    value: () => {},
  });
  return { container, root, separator, splitter };
}

describe("Splitter", () => {
  it("resizes the first pane when the separator is dragged", () => {
    const { container, root, separator } = renderSplitter();

    try {
      const grip = separator.querySelector<HTMLElement>(
        '[aria-hidden="true"]',
      )!;
      const gripStyle = getComputedStyle(grip);
      expect(grip.getAttribute("aria-hidden")).toBe("true");
      expect(gripStyle.position).toBe("absolute");
      expect(gripStyle.inset).toBe("0px");
      const separatorBounds = separator.getBoundingClientRect();
      const gripBounds = grip.getBoundingClientRect();
      expect(gripBounds.x).toBe(separatorBounds.x);
      expect(gripBounds.y).toBe(separatorBounds.y);
      expect(gripBounds.width).toBe(separatorBounds.width);
      expect(gripBounds.height).toBe(separatorBounds.height);
      const dots = [...grip.querySelectorAll<HTMLElement>(":scope > span")];
      expect(dots).toHaveLength(3);
      const dotBounds = dots.map((dot) => dot.getBoundingClientRect());
      const dotsCenterX =
        (Math.min(...dotBounds.map(({ x }) => x)) +
          Math.max(...dotBounds.map(({ x, width }) => x + width))) /
        2;
      const dotsCenterY =
        (Math.min(...dotBounds.map(({ y }) => y)) +
          Math.max(...dotBounds.map(({ y, height }) => y + height))) /
        2;
      expect(dotsCenterX).toBe(separatorBounds.x + separatorBounds.width / 2);
      expect(dotsCenterY).toBe(separatorBounds.y + separatorBounds.height / 2);
      expect(getComputedStyle(separator).flexBasis).toBe("5px");

      act(() => {
        separator.dispatchEvent(
          new PointerEvent("pointerdown", {
            bubbles: true,
            pointerId: 1,
            clientX: 400,
          }),
        );
        separator.dispatchEvent(
          new PointerEvent("pointermove", {
            bubbles: true,
            pointerId: 1,
            clientX: 500,
          }),
        );
      });

      expect(separator.getAttribute("aria-valuenow")).toBe("500");
      expect(
        (container.firstElementChild?.firstElementChild as HTMLElement).style
          .flexBasis,
      ).toBe("500px");
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });

  it("uses vertical split orientation and supports keyboard resizing", () => {
    const { container, root, separator, splitter } = renderSplitter("vertical");

    try {
      expect(separator.getAttribute("aria-orientation")).toBe("horizontal");
      act(() => {
        separator.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            key: "ArrowDown",
          }),
        );
      });

      expect(separator.getAttribute("aria-valuenow")).toBe("416");
      expect(splitter.className).toContain("vertical");
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });
});
