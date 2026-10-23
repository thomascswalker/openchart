import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { useEditorState } from "../../hooks/useEditorState";
import { runActionAsync, runAction } from "../../actions/execute";
import Platform from "../../platform";
import { Runtime } from "../../components/editor/Runtime";
import { usePlayback } from "../../hooks/usePlayback";

function CommandEnablementProbe() {
  const { error, isDirty } = useEditorState();
  const { isMetronomeEnabled, isClapEnabled } = usePlayback();
  return (
    <>
      <button type="button" onClick={() => runAction("document.mark-dirty")}>
        Change document
      </button>
      <button type="button" onClick={() => runAction("document.save")}>
        Save
      </button>
      <button type="button" onClick={() => runAction("document.new")}>
        New document
      </button>
      <span data-testid="dirty">{String(isDirty)}</span>
      <span data-testid="save-enabled">
        {String(Platform.actions.isAvailable("document.save"))}
      </span>
      <span data-testid="export-enabled">
        {String(Platform.actions.isAvailable("document.export-midi"))}
      </span>
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
      <Runtime>
        <CommandEnablementProbe />
      </Runtime>,
    ),
  );
  return { container, root };
}

describe("editor action state", () => {
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
    ).toContain("Action is unavailable in this context:");
    act(() => root.unmount());
    container.remove();
  });

  it("routes the new-document command to its executor", () => {
    const { container, root } = renderCommands();

    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    act(() => {
      container.querySelectorAll("button")[0].click();
    });
    act(() => {
      container.querySelectorAll("button")[2].click();
    });
    expect(container.querySelector('[data-testid="dirty"]')?.textContent).toBe(
      "false",
    );
    expect(confirm).toHaveBeenCalledOnce();
    confirm.mockRestore();
    act(() => root.unmount());
    container.remove();
  });

  it("toggles playback feedback through playback actions", async () => {
    const { container, root } = renderCommands();
    expect(
      container.querySelector('[data-testid="metronome-enabled"]')?.textContent,
    ).toBe("false");
    expect(
      container.querySelector('[data-testid="clap-enabled"]')?.textContent,
    ).toBe("false");
    await act(async () => {
      await runActionAsync("playback.toggle-metronome");
      await runActionAsync("playback.toggle-clap");
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
