import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { useEditorState } from "../../../hooks/useEditorState";
import { runAction } from "../../../actions/execute";
import { useDocumentSnapshot } from "../../../hooks/useDocumentSnapshot";
import { Runtime } from "../../Runtime";
import { Playback } from "../../Playback";
import { ProjectDialog } from "../ProjectDialog";

function ProjectTestShell() {
  const { projectVisible } = useEditorState();
  const { metadata } = useDocumentSnapshot();
  return (
    <>
      <button type="button" onClick={() => runAction("dialog.open-project")}>
        Open project
      </button>
      <output>{metadata.song.name}</output>
      {projectVisible ? <ProjectDialog /> : null}
    </>
  );
}

function renderProject(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() =>
    root.render(
      <Runtime>
        <Playback>
          <ProjectTestShell />
        </Playback>
      </Runtime>,
    ),
  );
  return { container, root };
}

function changeInput(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("ProjectDialog", () => {
  it("validates and applies project metadata through the command layer", async () => {
    const { container, root } = renderProject();
    act(() => container.querySelector<HTMLButtonElement>("button")?.click());

    const tabs = [
      ...container.querySelectorAll<HTMLElement>(
        '#dialog-sections [role="option"]',
      ),
    ];
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "song",
      "chart",
      "difficulty",
      "audio",
      "credits",
    ]);

    act(() => tabs.find((tab) => tab.textContent === "song")?.click());
    const nameLabel = [...container.querySelectorAll("label")].find((label) =>
      label.textContent?.startsWith("name"),
    )!;
    act(() =>
      changeInput(
        container.ownerDocument.getElementById(
          nameLabel.htmlFor,
        ) as HTMLInputElement,
        "Updated song",
      ),
    );
    await act(async () => {
      [...container.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent === "Apply")
        ?.click();
    });
    expect(container.querySelector("output")?.textContent).toBe("Updated song");
    act(() => root.unmount());
    container.remove();
  });
});
