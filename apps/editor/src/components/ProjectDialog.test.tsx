import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it } from "vitest";
import {
  EditorCommandProvider,
  useEditorCommands,
} from "../commands/EditorCommand";
import { ApplicationSettingsProvider } from "../context/ApplicationSettingsContext";
import { EditorProvider, useEditor } from "../context/EditorContext";
import { PlaybackProvider } from "../context/PlaybackContext";
import { createProjectMetadata } from "../project/projectMetadata";
import { ProjectDialog, getSections } from "./ProjectDialog";

function ProjectTestShell() {
  const { projectVisible, dispatch } = useEditorCommands();
  const { projectMetadata } = useEditor();
  return (
    <>
      <button type="button" onClick={() => void dispatch("project")}>
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
      <EditorProvider>
        <ApplicationSettingsProvider>
          <PlaybackProvider>
            <EditorCommandProvider>
              <ProjectTestShell />
            </EditorCommandProvider>
          </PlaybackProvider>
        </ApplicationSettingsProvider>
      </EditorProvider>,
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
    root.unmount();
    container.remove();
  });
});
