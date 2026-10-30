import {
  CommandExecutor,
  DefaultCompiledRuleset,
  EditingSession,
  RawMidiMode,
} from "@openchart/views";
import { Midi } from "@openchart/midi";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createModeToolbarGroups } from "./definitions";

describe("mode-driven toolbar definitions", () => {
  it("keeps built-in mode groups and generates controls for an extension mode", () => {
    class ExtensionMode extends RawMidiMode {
      public override readonly id = "test.extension";
      public override readonly label = "Extension";
      public override readonly toolStateSchema = z.object({
        enabled: z.boolean(),
      }) as never;
      public override createTools() {
        return [
          {
            id: "paint",
            label: "Paint",
            icon: "pencil",
            group: "extension-tools",
            stateKey: "enabled",
            value: true,
            toggle: { offValue: false },
          },
        ];
      }
      public override createDefaultToolState() {
        return { enabled: false } as never;
      }
    }
    const extension = new ExtensionMode();
    const midi = new Midi();
    const track = midi.tracks[midi.addTrack()]!;
    track.name = "LEAD GUITAR";
    const session = new EditingSession({
      document: new CommandExecutor(midi),
      mode: extension,
      target: { trackKey: "lead-guitar", trackIndex: 0, difficulty: null },
      hostKind: "test-view",
      rules: DefaultCompiledRuleset,
      transaction: {
        begin() {},
        record() {},
        end() {},
        rollback: () => false,
      },
    });
    const groups = createModeToolbarGroups(session);
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
          mode: session.mode,
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
