import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { Button } from "../shared/Button";
import { Popup } from "../shared/Popup";

function render(element: ReactNode): {
  container: HTMLDivElement;
  root: Root;
} {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(element));
  return { container, root };
}

function makeRect(left: number, top: number, width: number, height: number) {
  return {
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: () => {},
  } as DOMRect;
}

function setRect(element: Element, rect: DOMRect): void {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue(rect);
}

function cleanup(root: Root, container: HTMLDivElement): void {
  act(() => root.unmount());
  container.remove();
}

describe("Popup", () => {
  it("opens accessibly, closes on a second trigger press, and dismisses on Escape", () => {
    const { container, root } = render(
      <Popup
        trigger={<Button aria-label="Viewport settings">Settings</Button>}
        title="Viewport Settings"
      >
        <input aria-label="Lighting" />
      </Popup>,
    );
    const trigger = container.querySelector<HTMLButtonElement>("button")!;

    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    act(() => trigger.click());

    const dialog = document.querySelector('[role="dialog"]');
    // expect(dialog?.getAttribute("aria-labelledby")).toBeTruthy();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(
      dialog?.querySelector('input[aria-label="Lighting"]'),
    );

    act(() => trigger.click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    act(() => trigger.click());
    act(() => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);

    cleanup(root, container);
  });

  it("closes when the pointer is pressed outside the trigger and popup", () => {
    const { container, root } = render(
      <>
        <Popup
          trigger={<Button aria-label="Viewport settings">Settings</Button>}
          title="View"
        >
          <input aria-label="Lighting" />
        </Popup>
        <button data-testid="outside">Outside</button>
      </>,
    );
    const trigger = container.querySelector<HTMLButtonElement>("button")!;
    act(() => trigger.click());
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();

    act(() => {
      document
        .querySelector<HTMLButtonElement>('[data-testid="outside"]')!
        .dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    cleanup(root, container);
  });

  it("flips above and shifts left when the trigger is near the viewport edges", () => {
    const { container, root } = render(
      <Popup
        trigger={<Button aria-label="Viewport settings">Settings</Button>}
        title="View"
      >
        <input aria-label="Lighting" />
      </Popup>,
    );
    const trigger = container.querySelector<HTMLButtonElement>("button")!;
    const triggerTop = window.innerHeight - 45;
    setRect(trigger, makeRect(window.innerWidth - 50, triggerTop, 40, 40));

    act(() => trigger.click());
    const popup = document.querySelector<HTMLDivElement>('[role="dialog"]')!;
    setRect(popup, makeRect(0, 0, 280, 200));

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(popup.dataset.placement).toBe("top");
    expect(Number.parseFloat(popup.style.top)).toBeLessThan(triggerTop);
    expect(Number.parseFloat(popup.style.left)).toBeLessThanOrEqual(
      window.innerWidth - 280 - 8,
    );

    cleanup(root, container);
  });
});
