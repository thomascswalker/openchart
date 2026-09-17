import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { EditorCommandProvider, useEditorCommands } from "./EditorCommand";
import { ApplicationSettingsProvider } from "../context/ApplicationSettingsContext";
import { EditorProvider } from "../context/EditorContext";
import { PlaybackProvider } from "../context/PlaybackContext";
import { usePlayback } from "../context/PlaybackContextStore";

function CommandEnablementProbe() {
  const { canExecute, isDirty, markDirty } = useEditorCommands();
  const { isMetronomeEnabled, isClapEnabled } = usePlayback();
  return (
    <>
      <button type="button" onClick={markDirty}>
        Change document
      </button>
      <span data-testid="dirty">{String(isDirty)}</span>
      <span data-testid="save-enabled">{String(canExecute.save)}</span>
      <span data-testid="export-enabled">{String(canExecute.export)}</span>
      <span data-testid="metronome-enabled">
        {String(isMetronomeEnabled)}
      </span>
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
    root.unmount();
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
    root.unmount();
    container.remove();
  });

  it("toggles playback feedback with M and N", () => {
    const { container, root } = renderCommands();
    expect(container.querySelector('[data-testid="metronome-enabled"]')?.textContent).toBe(
      "false",
    );
    expect(container.querySelector('[data-testid="clap-enabled"]')?.textContent).toBe(
      "false",
    );
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "m" }));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "n" }));
    });
    expect(container.querySelector('[data-testid="metronome-enabled"]')?.textContent).toBe(
      "true",
    );
    expect(container.querySelector('[data-testid="clap-enabled"]')?.textContent).toBe(
      "true",
    );
    root.unmount();
    container.remove();
  });
});
