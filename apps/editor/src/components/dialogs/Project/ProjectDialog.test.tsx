import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { useEditor } from "../../../hooks/useEditorState";
import { runAction } from "../../../actions/execute";
import { useDocument } from "../../../hooks/useDocument";
import { Runtime } from "../../editor/Runtime";
import { Playback } from "../../editor/Playback";
import { ProjectDialog } from "./ProjectDialog";

function ProjectTestShell() {
  const { projectVisible } = useEditor();
  const { metadata } = useDocument();
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
    Object.getPrototypeOf(input),
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
      "Song",
      "Chart",
      "Difficulty",
      "Audio",
      "Credits",
    ]);

    act(() => tabs.find((tab) => tab.textContent === "Audio")?.click());
    expect(
      [...container.querySelectorAll("label")].some((label) =>
        label.textContent?.startsWith("Root"),
      ),
    ).toBe(true);
    const rootInput = [...container.querySelectorAll("label")].find((label) =>
      label.textContent?.startsWith("Root"),
    );
    expect(
      container.ownerDocument
        .getElementById(rootInput?.htmlFor ?? "")
        ?.parentElement?.querySelector("button"),
    ).not.toBeNull();

    act(() => tabs.find((tab) => tab.textContent === "Song")?.click());
    const nameLabel = [...container.querySelectorAll("label")].find((label) =>
      label.textContent?.startsWith("Name"),
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
