import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { Menubar } from "../Menubar";

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
  it("puts Project and Settings in File and editing actions in Edit", async () => {
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
    act(() => triggers[0].click());
    await settle();
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
    act(() => triggers[2].click());
    await settle();
    expect(
      [...container.querySelectorAll<HTMLButtonElement>("[data-command]")].map(
        (button) => button.textContent?.trim(),
      ),
    ).toEqual(["MetronomeM", "Highway ClapN"]);
    act(() => triggers[1].click());
    await settle();
    expect(
      container.querySelectorAll("[role=menu] [data-command]"),
    ).toHaveLength(3);
    expect(
      [...container.querySelectorAll<HTMLButtonElement>("[data-command]")].map(
        (button) => button.textContent?.trim(),
      ),
    ).toEqual(["CutCtrl/Cmd+X", "CopyCtrl/Cmd+C", "PasteCtrl/Cmd+V"]);
    act(() => root.unmount());
    container.remove();
  });

  it("opens with the keyboard, skips disabled items, and returns focus on Escape", async () => {
    const onCommand = vi.fn();
    const { container, root } = render(
      <Menubar
        canExecute={(command) => command !== "document.save"}
        onCommand={onCommand}
      />,
    );

    const fileTrigger = container.querySelector<HTMLButtonElement>(
      'button[role="menuitem"]',
    )!;
    act(() => fileTrigger.click());
    await settle();

    expect(fileTrigger.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector('[role="menu"]')).not.toBeNull();
    expect(document.activeElement?.textContent).toBe("New");

    act(() =>
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      ),
    );
    expect(document.activeElement?.textContent).toContain("Open");
    act(() =>
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      ),
    );
    await settle();
    const save = [
      ...container.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) => button.dataset.command === "document.save")!;
    expect(save.disabled).toBe(true);
    expect(document.activeElement?.textContent).toContain("Save As");

    act(() =>
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    await settle();
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(fileTrigger);
    expect(onCommand).not.toHaveBeenCalled();
    act(() => root.unmount());
    container.remove();
  });

  it("dispatches clipboard actions from the Edit menu", async () => {
    const onCommand = vi.fn();
    const { container, root } = render(
      <Menubar canExecute={() => true} onCommand={onCommand} />,
    );
    const editTrigger = [
      ...container.querySelectorAll<HTMLButtonElement>(
        'button[role="menuitem"]',
      ),
    ][1];
    act(() => editTrigger.click());
    await settle();
    const copy = container.querySelector<HTMLButtonElement>(
      '[data-command="clipboard.copy"]',
    );
    expect(copy).not.toBeNull();
    act(() => copy?.click());
    expect(onCommand).toHaveBeenCalledWith("clipboard.copy");
    act(() => root.unmount());
    container.remove();
  });

  it("dismisses an open menu when the pointer is pressed outside", async () => {
    const { container, root } = render(
      <>
        <Menubar canExecute={() => true} onCommand={() => {}} />
        <button type="button" data-testid="outside">
          Outside
        </button>
      </>,
    );

    const fileTrigger = container.querySelector<HTMLButtonElement>(
      'button[role="menuitem"]',
    )!;
    act(() => fileTrigger.click());
    await settle();
    expect(container.querySelector('[role="menu"]')).not.toBeNull();
    const outside = container.querySelector<HTMLButtonElement>(
      '[data-testid="outside"]',
    )!;
    act(() => {
      outside.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      outside.click();
    });
    await settle();
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(outside);
    act(() => root.unmount());
    container.remove();
  });
});
