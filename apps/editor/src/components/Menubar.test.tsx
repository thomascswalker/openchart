import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { Menubar } from "./Menubar";

function render(element: ReactNode): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(element));
  return { container, root };
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
  });
}

describe("Menubar", () => {
  it("places Project and app Settings in File while leaving Edit empty", () => {
    const { container, root } = render(
      <Menubar canExecute={() => true} onCommand={() => {}} />,
    );
    const triggers = [
      ...container.querySelectorAll<HTMLButtonElement>(
        'button[role="menuitem"]',
      ),
    ];
    expect(triggers.map((trigger) => trigger.textContent)).toEqual([
      "File",
      "Edit",
      "Playback",
      "Window",
    ]);
    triggers[0].click();
    expect(
      [...container.querySelectorAll<HTMLButtonElement>("[data-command]")].map(
        (button) => button.textContent?.trim(),
      ),
    ).toContain("Project...");
    expect(
      [...container.querySelectorAll<HTMLButtonElement>("[data-command]")].map(
        (button) => button.textContent?.trim(),
      ),
    ).toContain("Settings...Ctrl/Cmd+,");
    triggers[2].click();
    expect(
      [...container.querySelectorAll<HTMLButtonElement>("[data-command]")].map(
        (button) => button.textContent?.trim(),
      ),
    ).toEqual(["MetronomeM", "Highway ClapN"]);
    triggers[1].click();
    expect(
      container.querySelectorAll("[role=menu] [data-command]"),
    ).toHaveLength(0);
    root.unmount();
    container.remove();
  });

  it("opens with the keyboard, skips disabled items, and returns focus on Escape", async () => {
    const onCommand = vi.fn();
    const { container, root } = render(
      <Menubar
        canExecute={(command) => command !== "save"}
        onCommand={onCommand}
      />,
    );

    const fileTrigger = container.querySelector<HTMLButtonElement>(
      'button[role="menuitem"]',
    )!;
    fileTrigger.click();
    await settle();

    expect(fileTrigger.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector('[role="menu"]')).not.toBeNull();
    expect(document.activeElement?.textContent).toBe("New");

    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
    expect(document.activeElement?.textContent).toContain("Open");
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
    await settle();
    const save = [
      ...container.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) => button.dataset.command === "save")!;
    expect(save.disabled).toBe(true);
    expect(document.activeElement?.textContent).toContain("Save As");

    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await settle();
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(fileTrigger);
    expect(onCommand).not.toHaveBeenCalled();
    root.unmount();
    container.remove();
  });

  it("dismisses an open menu when the pointer is pressed outside", async () => {
    const { container, root } = render(
      <>
        <Menubar canExecute={() => true} onCommand={() => {}} />
        <button type="button">Outside</button>
      </>,
    );

    const fileTrigger = container.querySelector<HTMLButtonElement>(
      'button[role="menuitem"]',
    )!;
    fileTrigger.click();
    await settle();
    expect(container.querySelector('[role="menu"]')).not.toBeNull();
    const outside =
      container.querySelector<HTMLButtonElement>("button:last-child")!;
    outside.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    outside.click();
    await settle();
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(outside);
    root.unmount();
    container.remove();
  });
});
