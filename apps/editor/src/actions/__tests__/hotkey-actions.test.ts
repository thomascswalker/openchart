import { describe, expect, it, vi } from "vitest";
import { VocalNoteKind, VocalPhraseKind } from "@openchart/views";
import type { ServicesAccessor } from "../../platform/services";
import { ViewportService } from "../../services/editor/viewports";
import { EditorStateService } from "../../services/editor/state";
import { ActiveChartViewService } from "../../services/editor/activeChartView";
import { CloseTopmostDialogAction } from "../dialog/close-topmost";
import { SetHighwayToolAction } from "../highway/set-tool";
import { ToggleHighwayPhraseToolAction } from "../highway/toggle-phrase-tool";
import { ToggleVocalPhraseAction } from "../piano-roll/toggle-vocal-phrase";
import { DeleteSelectionAction } from "../editor/delete-selection";
import { StepSnapDenominatorAction } from "../editor/step-snap-denominator";
import { TransposeSelectionAction } from "../piano-roll/transpose-selection";
import { ToggleLaneNoteAction } from "../highway/toggle-lane-note";
import { ReleaseLaneNoteAction } from "../highway/release-lane-note";
import { createTestRulesetService } from "../../services/__tests__/testUtils";
import type { EditingModeId } from "@openchart/views";

function accessor(services: Record<string, unknown>): ServicesAccessor {
  return { get: <T>(id: string) => services[id] as T };
}

describe("viewport tool actions", () => {
  function toolServices(viewports: ViewportService, modeId: string) {
    const editing = {
      getActiveSession: () => ({
        mode: { id: modeId, tools: [{ stateKey: "phrase" }] },
        getTools: () => [
          { stateKey: "phrase", value: "solo" },
          { stateKey: "phrase", value: "stagepower" },
        ],
        getToolState: () => viewports.getActiveViewport()?.tools[modeId] ?? {},
      }),
      updateToolState: (
        viewportId: string,
        id: EditingModeId,
        update: Record<string, unknown>,
      ) => {
        const current = viewports.getViewport(viewportId)?.tools[id] ?? {};
        viewports.setModeToolState(viewportId, id, {
          ...(current as Record<string, unknown>),
          ...update,
        });
      },
    };
    return accessor({
      "editor.viewports": viewports,
      "editor.editing": editing,
    });
  }

  it("sets the highway tool on the active viewport only", () => {
    const viewports = new ViewportService(createTestRulesetService());
    const other = viewports.getSnapshot().activeViewportId;
    viewports.setModeToolState(other, "chart.lanes", {
      tool: "select",
      phrase: null,
      placement: "normal",
    });
    const active = viewports.addViewport("highway")!;
    viewports.setModeToolState(active, "chart.lanes", {
      tool: "select",
      phrase: "solo",
      placement: "normal",
    });
    new SetHighwayToolAction().run(
      toolServices(viewports, "chart.lanes"),
      "place",
    );
    expect(
      (viewports.getViewport(active)?.tools["chart.lanes"] as { tool: string })
        .tool,
    ).toBe("place");
    expect(
      (
        viewports.getViewport(active)?.tools["chart.lanes"] as {
          phrase: null;
        }
      ).phrase,
    ).toBeNull();
    expect(
      (viewports.getViewport(other)?.tools["chart.lanes"] as { tool: string })
        .tool,
    ).toBe("select");
  });

  it("toggles phrase tools back to select", () => {
    const viewports = new ViewportService(createTestRulesetService());
    const services = toolServices(viewports, "chart.lanes");
    const action = new ToggleHighwayPhraseToolAction();
    action.run(services, "solo");
    expect(
      (
        viewports.getActiveViewport()?.tools["chart.lanes"] as {
          phrase: string;
        }
      ).phrase,
    ).toBe("solo");
    expect(
      (viewports.getActiveViewport()?.tools["chart.lanes"] as { tool: string })
        .tool,
    ).toBe("select");
    action.run(services, "stagepower");
    expect(
      (
        viewports.getActiveViewport()?.tools["chart.lanes"] as {
          phrase: string;
        }
      ).phrase,
    ).toBe("stagepower");
    action.run(services, "stagepower");
    expect(
      (viewports.getActiveViewport()?.tools["chart.lanes"] as { phrase: null })
        .phrase,
    ).toBeNull();
  });

  it("toggles vocal phrases and keeps the note kind", () => {
    const viewports = new ViewportService(createTestRulesetService());
    const id = viewports.getSnapshot().activeViewportId;
    viewports.setModeToolState(id, "midi.vocals", {
      noteKind: VocalNoteKind.Percussion,
      phrase: null,
    });
    const services = toolServices(viewports, "midi.vocals");
    const action = new ToggleVocalPhraseAction();
    action.run(services, VocalPhraseKind.Vocal);
    expect(viewports.getActiveViewport()?.tools["midi.vocals"]).toEqual({
      noteKind: VocalNoteKind.Percussion,
      phrase: VocalPhraseKind.Vocal,
    });
    action.run(services, VocalPhraseKind.Vocal);
    expect(
      (
        viewports.getActiveViewport()?.tools["midi.vocals"] as {
          phrase: string | null;
        }
      ).phrase,
    ).toBeNull();
  });

  it("steps the snap denominator through the available choices", () => {
    const viewports = new ViewportService(createTestRulesetService());
    viewports.setSnapDenominator(4);
    const action = new StepSnapDenominatorAction();
    const services = accessor({ "editor.viewports": viewports });
    action.run(services, 1);
    expect(viewports.getSnapshot().snapDenominator).toBeGreaterThan(4);
    action.run(services, -1);
    expect(viewports.getSnapshot().snapDenominator).toBe(4);
  });
});

describe("dialog.close-topmost", () => {
  it("closes one dialog at a time, frontmost first", () => {
    const state = new EditorStateService();
    state.setSettingsVisible(true);
    state.setAboutVisible(true);
    const action = new CloseTopmostDialogAction();
    action.run(accessor({ "editor.state": state }));
    expect(state.getSnapshot().aboutVisible).toBe(false);
    expect(state.getSnapshot().settingsVisible).toBe(true);
    action.run(accessor({ "editor.state": state }));
    expect(state.getSnapshot().settingsVisible).toBe(false);
  });
});

describe("view command actions", () => {
  it("do nothing without a matching active view", () => {
    const active = new ActiveChartViewService();
    const services = accessor({
      "editor.active-chart-view": active,
      "editor.editing": { getActiveSession: () => null },
    });
    expect(() => new DeleteSelectionAction().run(services)).not.toThrow();
    expect(() =>
      new ToggleLaneNoteAction().run(services, 0, false),
    ).not.toThrow();
    expect(() => new ReleaseLaneNoteAction().run(services, 0)).not.toThrow();
    expect(() => new TransposeSelectionAction().run(services, 1)).not.toThrow();
  });

  it("route to the active view only when the kind matches", () => {
    const active = new ActiveChartViewService();
    const highway = {
      kind: "highway" as const,
      toggleLaneNote: vi.fn(),
      releaseLaneNote: vi.fn(),
      deleteSelection: vi.fn(),
    };
    active.set(highway as never);
    const selection = { getSelectedIds: () => [] };
    const editingSession = { selection, execute: vi.fn() };
    const services = accessor({
      "editor.active-chart-view": active,
      "editor.editing": { getActiveSession: () => editingSession },
    });
    new ToggleLaneNoteAction().run(services, 2, true);
    expect(highway.toggleLaneNote).toHaveBeenCalledWith(2, true);
    new ReleaseLaneNoteAction().run(services, 2);
    expect(highway.releaseLaneNote).toHaveBeenCalledWith(2);
    new DeleteSelectionAction().run(services);
    expect(highway.deleteSelection).not.toHaveBeenCalled();
    expect(editingSession.execute).not.toHaveBeenCalled();
    // A piano roll command must not reach a highway view.
    new TransposeSelectionAction().run(services, 12);
    expect(active.getActive("piano-roll")).toBeNull();
  });
});
