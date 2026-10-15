import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { Runtime } from "../../components/Runtime";
import { useEditorState } from "../useEditorState";
import { runActionAsync, runAction } from "../../actions/execute";
import Platform from "../../platform";
import { DocumentService } from "../../services/document";
import { useDocumentSnapshot } from "../useDocumentSnapshot";

function HistoryHarness() {
  const {
    midi: midiData,
    canUndo: canUndo,
    canRedo: canRedo,
  } = useDocumentSnapshot();
  const document = Platform.services.get<DocumentService>("document");
  const { isDirty } = useEditorState();
  const [view, setView] = useState<"highway" | "piano-roll">("highway");

  const addNote = (): void => {
    if (!midiData) return;
    if (midiData.tracks.length === 0) midiData.addTrack();
    midiData.tracks[0]?.addNote(60, 0, 100, 120);
    runAction("history.record-edit");
    runAction("document.mark-dirty");
  };

  return (
    <>
      <output data-testid="note-count">
        {midiData?.tracks[0]?.getNotes().length ?? 0}
      </output>
      <output data-testid="history-state">
        {`${canUndo}:${canRedo}:${isDirty}`}
      </output>
      <output data-testid="view">{view}</output>
      <button type="button" onClick={addNote}>
        Add note
      </button>
      <button
        type="button"
        onClick={() =>
          setView((current) =>
            current === "highway" ? "piano-roll" : "highway",
          )
        }
      >
        Switch view
      </button>
      <button type="button" onClick={() => document.reset()}>
        Replace document
      </button>
      <input aria-label="Text field" />
    </>
  );
}

function renderHistory(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() =>
    root.render(
      <Runtime>
        <HistoryHarness />
      </Runtime>,
    ),
  );
  return { container, root };
}

describe("editor history commands", () => {
  it("undoes and redoes shared MIDI edits across view switches", async () => {
    const { container, root } = renderHistory();
    const addButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Add note",
    )!;
    const switchButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Switch view",
    )!;

    expect(Platform.actions.isAvailable("history.undo")).toBe(false);
    act(() => addButton.click());
    expect(
      container.querySelector('[data-testid="note-count"]')?.textContent,
    ).toBe("1");
    act(() => switchButton.click());
    expect(container.querySelector('[data-testid="view"]')?.textContent).toBe(
      "piano-roll",
    );

    await act(async () => {
      await runActionAsync("history.undo");
    });
    expect(
      container.querySelector('[data-testid="note-count"]')?.textContent,
    ).toBe("0");
    expect(
      container.querySelector('[data-testid="history-state"]')?.textContent,
    ).toBe("false:true:true");

    await act(async () => {
      await runActionAsync("history.redo");
    });
    expect(
      container.querySelector('[data-testid="note-count"]')?.textContent,
    ).toBe("1");

    const replaceButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Replace document",
    )!;
    act(() => replaceButton.click());
    expect(
      container.querySelector('[data-testid="history-state"]')?.textContent,
    ).toBe("false:false:false");
    expect(Platform.actions.isAvailable("history.undo")).toBe(false);

    act(() => root.unmount());
    container.remove();
  });
});
