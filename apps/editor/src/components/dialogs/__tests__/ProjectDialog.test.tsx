import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { useEditorState } from "../../../hooks/useEditorState";
import { runAction } from "../../../actions/execute";
import { useDocumentSnapshot } from "../../../hooks/useDocumentSnapshot";
import { Runtime } from "../../Runtime";
import { Playback } from "../../Playback";
import { createProjectMetadata } from "../../../project/projectMetadata";
import { ProjectDialog, getSections } from "../ProjectDialog";

function ProjectTestShell() {
  const { projectVisible } = useEditorState();
  const { projectMetadata } = useDocumentSnapshot();
  return (
    <>
      <button type="button" onClick={() => runAction("dialog.open-project")}>
        Open project
      </button>
      <output>{projectMetadata.Song.Name}</output>
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
  it("maps primitive root keys to General and object keys to sections", () => {
    expect(
      getSections(createProjectMetadata()).map((section) => section.title),
    ).toEqual(["General", "Song", "Chart", "Difficulty", "Credits"]);
    expect(
      getSections(createProjectMetadata())[0].fields.map((field) => field.key),
    ).toEqual(["Version", "ID"]);
  });

  it("validates and applies project metadata through the command layer", () => {
    const { container, root } = renderProject();
    act(() => container.querySelector<HTMLButtonElement>("button")?.click());

    const tabs = [
      ...container.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    ];
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "General",
      "Song",
      "Chart",
      "Difficulty",
      "Credits",
    ]);

    act(() => tabs.find((tab) => tab.textContent === "Song")?.click());
    const nameLabel = [...container.querySelectorAll("label")].find((label) =>
      label.textContent?.startsWith("Name"),
    )!;
    act(() => changeInput(nameLabel.querySelector("input")!, "Updated song"));
    act(() =>
      [...container.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent === "Apply")
        ?.click(),
    );
    expect(container.querySelector("output")?.textContent).toBe("Updated song");
    act(() => root.unmount());
    container.remove();
  });
});
