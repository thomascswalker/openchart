import { createChartFretsMode, createVocalsMode } from "@openchart/views";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { ToolGroup } from "./ToolGroup";
import { createModeToolbarGroups } from "./definitions";
import type { ToolbarContextState, ToolbarEditorState } from "./types";

describe("mode-driven toolbar rendering", () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  afterEach(() => {
    if (root) act(() => root?.unmount());
    container?.remove();
    root = null;
    container = null;
  });

  it("preserves Highway tool labels and ordering from mode descriptors", () => {
    const mode = createChartFretsMode();
    const session = {
      id: "viewport-1",
      view: "highway" as const,
      trackKey: "lead-guitar",
      instrument: "LEAD GUITAR",
      difficulty: 3,
      camera: { tick: 0 },
      tools: {},
    };
    const context: ToolbarContextState = {
      activeView: "highway",
      trackType: "LEAD GUITAR",
      sessionId: session.id,
      playbackTick: 0,
      canHostView: () => true,
    };
    const editorState: ToolbarEditorState = {
      session,
      mode,
      toolState: mode.createDefaultToolState(),
      snapEnabled: true,
      snapDenominator: 4,
      lockCursor: true,
      vocalPitchFeedbackEnabled: false,
    };
    container = document.createElement("div");
    root = createRoot(container);
    const highwayGroup = createModeToolbarGroups(mode).find(
      (group) => group.id === "highway-tools",
    )!;

    act(() => {
      root?.render(
        <ToolGroup
          group={highwayGroup}
          context={context}
          editorState={editorState}
        />,
      );
    });

    expect(
      Array.from(container.querySelectorAll("button")).map((button) =>
        button.getAttribute("aria-label"),
      ),
    ).toEqual([
      "Select, move, and edit sustains",
      "Place notes",
      "Remove notes",
      "Stagepower phrase",
      "Solo phrase",
    ]);
    expect(
      createModeToolbarGroups(mode)
        .find((group) => group.id === "difficulty")
        ?.items.map((item) => item.label),
    ).toEqual(["easy", "medium", "hard", "expert"]);
  });

  it("preserves Piano Roll vocal tools and playback control", () => {
    const mode = createVocalsMode();
    const session = {
      id: "viewport-1",
      view: "piano-roll" as const,
      trackKey: "vocals",
      instrument: "VOCALS",
      difficulty: 3,
      camera: { tick: 0 },
      tools: {},
    };
    const context: ToolbarContextState = {
      activeView: "piano-roll",
      trackType: "VOCALS",
      sessionId: session.id,
      playbackTick: 0,
      canHostView: () => true,
    };
    const editorState: ToolbarEditorState = {
      session,
      mode,
      toolState: mode.createDefaultToolState(),
      snapEnabled: true,
      snapDenominator: 4,
      lockCursor: true,
      vocalPitchFeedbackEnabled: false,
    };
    container = document.createElement("div");
    root = createRoot(container);
    const vocalGroup = createModeToolbarGroups(mode).find(
      (group) => group.id === "vocal-tools",
    )!;

    act(() => {
      root?.render(
        <ToolGroup
          group={vocalGroup}
          context={context}
          editorState={editorState}
        />,
      );
    });

    expect(
      Array.from(container.querySelectorAll("button")).map((button) =>
        button.getAttribute("aria-label"),
      ),
    ).toEqual([
      "Vocal phrase",
      "Power window",
      "Stagepower phrase",
      "Vocal pitch feedback",
    ]);
  });
});
