import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { EditorCommandProvider, useEditorCommands } from "./EditorCommand";
import { EditorProvider } from "../context/EditorContext";
import { PlaybackProvider } from "../context/PlaybackContext";

function CommandEnablementProbe() {
  const { canExecute, isDirty, markDirty } = useEditorCommands();
  return (
    <>
      <button type="button" onClick={markDirty}>
        Change document
      </button>
      <span data-testid="dirty">{String(isDirty)}</span>
      <span data-testid="save-enabled">{String(canExecute.save)}</span>
      <span data-testid="export-enabled">{String(canExecute.export)}</span>
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
        <PlaybackProvider>
          <EditorCommandProvider>
            <CommandEnablementProbe />
          </EditorCommandProvider>
        </PlaybackProvider>
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
});
