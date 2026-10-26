import { EditingModeRegistry, createRawMidiMode } from "@openchart/views";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createModeToolbarGroups } from "./definitions";

describe("mode-driven toolbar definitions", () => {
  it("keeps built-in mode groups and generates controls for an extension mode", () => {
    const registry = new EditingModeRegistry();
    const extension = {
      ...createRawMidiMode(),
      id: "test.extension",
      label: "Extension",
      tools: [
        {
          id: "paint",
          label: "Paint",
          icon: "pencil",
          group: "extension-tools",
          stateKey: "enabled",
          value: true,
          toggle: { offValue: false },
        },
      ],
      toolStateSchema: z.object({ enabled: z.boolean() }),
      createDefaultToolState: () => ({ enabled: false }),
    };
    registry.register(extension);

    const mode = registry.getById("test.extension");
    expect(mode).not.toBeNull();
    const groups = createModeToolbarGroups(mode!);
    expect(groups.map((group) => group.id)).toEqual(["extension-tools"]);
    const tool = groups[0]!.items[0]!;
    expect(tool.id).toBe("paint");
    expect(tool.actionId).toBe("editor.set-viewport-tools");
    expect(
      tool.actionPayload?.(
        {
          activeView: "piano-roll",
          trackType: "LEAD GUITAR",
          sessionId: "viewport-1",
          playbackTick: 0,
          canHostView: () => true,
        },
        {
          session: {
            id: "viewport-1",
            view: "piano-roll",
            trackKey: "lead-guitar",
            instrument: "LEAD GUITAR",
            difficulty: 3,
            camera: { tick: 0 },
            tools: {},
          },
          mode: mode!,
          toolState: { enabled: false },
          snapEnabled: true,
          snapDenominator: 4,
          lockCursor: true,
          vocalPitchFeedbackEnabled: false,
        },
      ),
    ).toEqual(["viewport-1", "test.extension", { enabled: true }]);
  });
});
