import { describe, expect, it } from "vitest";
import { renderHotkeyTables, formatHotkeyForDocs } from "../controlsDoc";
import { defineBindings } from "../define";
import { allBindings } from "../index";

describe("defineBindings", () => {
  it("splits action and variant and fills defaults", () => {
    const [binding] = defineBindings("global", {
      "history.redo#alias": { hotkey: "Mod+Y", name: "Redo", group: "Edit" },
    });
    expect(binding).toMatchObject({
      id: "global.history.redo.alias",
      action: "history.redo",
      variant: "alias",
      args: [],
      target: "document",
      options: {},
    });
  });

  it("omits the variant segment when there is none", () => {
    const [binding] = defineBindings("highway", {
      "highway.step-playhead": { hotkey: "ArrowUp", name: "Step", group: "H" },
    });
    expect(binding.id).toBe("highway.highway.step-playhead");
    expect(binding.variant).toBeUndefined();
  });
});

describe("controls documentation", () => {
  it("formats chords for display", () => {
    expect(formatHotkeyForDocs("Mod+Shift+S")).toBe("Ctrl/Cmd + Shift + S");
    expect(formatHotkeyForDocs("ArrowUp")).toBe("Up");
    expect(formatHotkeyForDocs("Mod+,")).toBe("Ctrl/Cmd + ,");
  });

  it("lists every binding exactly once", () => {
    const markdown = renderHotkeyTables(allBindings);
    const rows = markdown.split("\n").filter((line) => line.startsWith("| **"));
    expect(rows).toHaveLength(allBindings.length);
  });
});
