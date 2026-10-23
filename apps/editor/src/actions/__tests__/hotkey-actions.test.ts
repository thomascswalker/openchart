import { describe, expect, it, vi } from "vitest";
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

function accessor(services: Record<string, unknown>): ServicesAccessor {
  return { get: <T>(id: string) => services[id] as T };
}

describe("viewport tool actions", () => {
  it("sets the highway tool on the active viewport only", () => {
    const viewports = new ViewportService();
    const other = viewports.getSnapshot().activeViewportId;
    const active = viewports.addViewport("highway")!;
    new SetHighwayToolAction().run(
      accessor({ "editor.viewports": viewports }),
      "place",
    );
    expect(viewports.getViewport(active)?.tools.highwayMode).toBe("place");
    expect(viewports.getViewport(other)?.tools.highwayMode).toBe("select");
  });

  it("toggles phrase tools back to select", () => {
    const viewports = new ViewportService();
    const services = accessor({ "editor.viewports": viewports });
    const action = new ToggleHighwayPhraseToolAction();
    action.run(services, "solo");
    expect(viewports.getActiveViewport()?.tools.highwayMode).toBe("solo");
    action.run(services, "stagepower");
    expect(viewports.getActiveViewport()?.tools.highwayMode).toBe("stagepower");
    action.run(services, "stagepower");
    expect(viewports.getActiveViewport()?.tools.highwayMode).toBe("select");
  });

  it("toggles vocal phrases and keeps the note kind", () => {
    const viewports = new ViewportService();
    const id = viewports.getSnapshot().activeViewportId;
    viewports.updateTools(id, {
      vocalPlacement: { noteKind: "percussion", phrase: null },
    });
    const services = accessor({ "editor.viewports": viewports });
    const action = new ToggleVocalPhraseAction();
    action.run(services, "vocal");
    expect(viewports.getActiveViewport()?.tools.vocalPlacement).toEqual({
      noteKind: "percussion",
      phrase: "vocal",
    });
    action.run(services, "vocal");
    expect(
      viewports.getActiveViewport()?.tools.vocalPlacement.phrase,
    ).toBeNull();
  });

  it("steps the snap denominator through the available choices", () => {
    const viewports = new ViewportService();
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
    const services = accessor({ "editor.active-chart-view": active });
    expect(() => new DeleteSelectionAction().run(services)).not.toThrow();
    expect(() =>
      new ToggleLaneNoteAction().run(services, 0, false),
    ).not.toThrow();
    expect(() => new TransposeSelectionAction().run(services, 1)).not.toThrow();
  });

  it("route to the active view only when the kind matches", () => {
    const active = new ActiveChartViewService();
    const highway = {
      kind: "highway" as const,
      toggleLaneNote: vi.fn(),
      deleteSelection: vi.fn(),
    };
    active.set(highway as never);
    const services = accessor({ "editor.active-chart-view": active });
    new ToggleLaneNoteAction().run(services, 2, true);
    expect(highway.toggleLaneNote).toHaveBeenCalledWith(2, true);
    new DeleteSelectionAction().run(services);
    expect(highway.deleteSelection).toHaveBeenCalledOnce();
    // A piano roll command must not reach a highway view.
    new TransposeSelectionAction().run(services, 12);
    expect(active.getActive("piano-roll")).toBeNull();
  });
});
