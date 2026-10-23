import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { Tabs } from "./Tab";

function renderTabs(collapsible: boolean) {
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(
      <Tabs
        collapsible={collapsible}
        options={[
          { title: "Tracks", icon: "Tracks" },
          { title: "Mixer", icon: "Mixer" },
        ]}
      >
        {[
          <div key="tracks">Track content</div>,
          <div key="mixer">Mixer content</div>,
        ]}
      </Tabs>,
    );
  });
  return {
    container,
    root,
    buttons: container.querySelectorAll("button"),
  };
}

describe("Tabs", () => {
  it("keeps the active tab open by default", () => {
    const { container, root, buttons } = renderTabs(false);

    try {
      act(() => buttons[0]!.click());

      expect(container.textContent).toContain("Track content");
      expect(buttons[0]?.getAttribute("aria-pressed")).toBe("true");
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });

  it("closes the active tab when collapsible", () => {
    const { container, root, buttons } = renderTabs(true);

    try {
      act(() => buttons[0]!.click());

      expect(container.textContent).not.toContain("Track content");
      expect(buttons[0]?.getAttribute("aria-pressed")).toBe("false");
      expect(container.firstElementChild?.getAttribute("data-collapsed")).toBe(
        "true",
      );

      act(() => buttons[1]!.click());
      expect(container.textContent).toContain("Mixer content");
      expect(buttons[1]?.getAttribute("aria-pressed")).toBe("true");

      act(() => buttons[1]!.click());
      expect(container.textContent).not.toContain("Mixer content");
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });
});
