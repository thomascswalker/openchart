import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { EditorCommandProvider, useEditorCommands } from "./useEditorCommands";
import { ApplicationSettingsProvider } from "../context/ApplicationSettingsContext";
import { EditorProvider } from "../context/EditorContext";
import { PlaybackProvider } from "../context/PlaybackContext";
import { usePlayback } from "../context/PlaybackContextStore";

function CommandEnablementProbe() {
  const { canExecute, debugVisible, dispatch, error, isDirty, markDirty } =
    useEditorCommands();
  const { isMetronomeEnabled, isClapEnabled } = usePlayback();
  return (
    <>
      <button type="button" onClick={markDirty}>
        Change document
      </button>
      <button type="button" onClick={() => void dispatch("save")}>
        Save
      </button>
      <button type="button" onClick={() => void dispatch("openDebugSettings")}>
        Open debug
      </button>
      <button type="button" onClick={() => void dispatch("closeDebugSettings")}>
        Close debug
      </button>
      <button type="button" onClick={() => void dispatch("new")}>
        New document
      </button>
      <span data-testid="dirty">{String(isDirty)}</span>
      <span data-testid="save-enabled">{String(canExecute.save)}</span>
      <span data-testid="export-enabled">{String(canExecute.export)}</span>
      <span data-testid="debug-visible">{String(debugVisible)}</span>
      <span data-testid="command-error">{error ?? ""}</span>
      <span data-testid="metronome-enabled">{String(isMetronomeEnabled)}</span>
      <span data-testid="clap-enabled">{String(isClapEnabled)}</span>
    </>
  );
}

function renderCommands(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() =>
    root.render(
      <EditorProvider>
        <ApplicationSettingsProvider>
          <PlaybackProvider>
            <EditorCommandProvider>
              <CommandEnablementProbe />
            </EditorCommandProvider>
          </PlaybackProvider>
        </ApplicationSettingsProvider>
      </EditorProvider>,
    ),
  );
  return { container, root };
}

describe("EditorCommandProvider", () => {
  it("disables document commands until the active document has tracks", () => {
    const { container, root } = renderCommands();

    expect(
      container.querySelector('[data-testid="save-enabled"]')?.textContent,
    ).toBe("false");
    expect(
      container.querySelector('[data-testid="export-enabled"]')?.textContent,
    ).toBe("false");
    act(() => root.unmount());
    container.remove();
  });

  it("owns dirty state and exposes it to command consumers", () => {
    const { container, root } = renderCommands();

    expect(container.querySelector('[data-testid="dirty"]')?.textContent).toBe(
      "false",
    );
    act(() => {
      container.querySelector<HTMLButtonElement>("button")?.click();
    });
    expect(container.querySelector('[data-testid="dirty"]')?.textContent).toBe(
      "true",
    );
    act(() => root.unmount());
    container.remove();
  });

  it("rejects unavailable commands and reports the dispatch error", () => {
    const { container, root } = renderCommands();

    act(() => {
      container.querySelectorAll("button")[1].click();
    });
    expect(
      container.querySelector('[data-testid="command-error"]')?.textContent,
    ).toBe("This command is not available for the active document.");
    act(() => root.unmount());
    container.remove();
  });

  it("routes debug and new-document commands to their executors", () => {
    const { container, root } = renderCommands();

    act(() => {
      container.querySelectorAll("button")[2].click();
    });
    expect(
      container.querySelector('[data-testid="debug-visible"]')?.textContent,
    ).toBe("true");

    act(() => {
      container.querySelectorAll("button")[3].click();
    });
    expect(
      container.querySelector('[data-testid="debug-visible"]')?.textContent,
    ).toBe("false");

    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    act(() => {
      container.querySelectorAll("button")[0].click();
    });
    act(() => {
      container.querySelectorAll("button")[4].click();
    });
    expect(container.querySelector('[data-testid="dirty"]')?.textContent).toBe(
      "false",
    );
    expect(confirm).toHaveBeenCalledOnce();
    confirm.mockRestore();
    act(() => root.unmount());
    container.remove();
  });

  it("toggles playback feedback with M and N", () => {
    const { container, root } = renderCommands();
    expect(
      container.querySelector('[data-testid="metronome-enabled"]')?.textContent,
    ).toBe("false");
    expect(
      container.querySelector('[data-testid="clap-enabled"]')?.textContent,
    ).toBe("false");
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "m" }));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "n" }));
    });
    expect(
      container.querySelector('[data-testid="metronome-enabled"]')?.textContent,
    ).toBe("true");
    expect(
      container.querySelector('[data-testid="clap-enabled"]')?.textContent,
    ).toBe("true");
    act(() => root.unmount());
    container.remove();
  });
});
