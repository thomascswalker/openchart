import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { runAction } from "../../../actions/execute";
import { useEditorState } from "../../../hooks/useEditorState";
import Platform from "../../../platform";
import { EditorStateService } from "../../../services/editor/state";
import { Runtime } from "../../Runtime";
import { AboutDialog } from "../AboutDialog";

function AboutTestShell() {
  const { aboutVisible } = useEditorState();
  return (
    <>
      <button type="button" onClick={() => runAction("dialog.open-about")}>
        Open about
      </button>
      {aboutVisible ? <AboutDialog /> : null}
    </>
  );
}

function renderAbout(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() =>
    root.render(
      <Runtime>
        <AboutTestShell />
      </Runtime>,
    ),
  );
  return { container, root };
}

describe("AboutDialog", () => {
  afterEach(() => {
    act(() =>
      Platform.services
        .get<EditorStateService>("editor.state")
        .setAboutVisible(false),
    );
  });

  it("shows the repository name and closes from the Close button", () => {
    const { container, root } = renderAbout();
    act(() => container.querySelector<HTMLButtonElement>("button")!.click());

    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(
      container.querySelector('[data-testid="about-repo-name"]')?.textContent,
    ).toBe("thomascswalker/openchart");

    act(() =>
      [...container.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent === "Close")!
        .click(),
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    act(() => root.unmount());
    container.remove();
  });

  it("closes on Escape", () => {
    const { container, root } = renderAbout();
    act(() => container.querySelector<HTMLButtonElement>("button")!.click());
    const dialog = container.querySelector<HTMLElement>('[role="dialog"]')!;
    act(() => {
      dialog.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    act(() => root.unmount());
    container.remove();
  });
});
