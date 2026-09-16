import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it } from "vitest";
import {
  EditorCommandProvider,
  useEditorCommands,
} from "../commands/EditorCommand";
import {
  ApplicationSettingsProvider,
  defaultApplicationSettings,
  useApplicationSettings,
  validateApplicationSettings,
} from "../context/ApplicationSettingsContext";
import { EditorProvider } from "../context/EditorContext";
import { PlaybackProvider } from "../context/PlaybackContext";
import { SettingsDialog } from "./SettingsDialog";

function SettingsTestShell() {
  const { settingsVisible, dispatch } = useEditorCommands();
  const { settings } = useApplicationSettings();
  return (
    <>
      <button type="button" onClick={() => void dispatch("settings")}>
        Open settings
      </button>
      <output>{settings.audio.rootPath}</output>
      {settingsVisible ? <SettingsDialog /> : null}
    </>
  );
}

function renderSettings(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() =>
    root.render(
      <EditorProvider>
        <PlaybackProvider>
          <ApplicationSettingsProvider>
            <EditorCommandProvider>
              <SettingsTestShell />
            </EditorCommandProvider>
          </ApplicationSettingsProvider>
        </PlaybackProvider>
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

describe("Application settings", () => {
  beforeEach(() => localStorage.clear());

  it("has valid versioned defaults", () => {
    expect(defaultApplicationSettings.version).toBe(1);
    expect(defaultApplicationSettings.audio.rootPath).toBe("~");
    expect(validateApplicationSettings(defaultApplicationSettings)).toEqual({});
  });

  it("navigates tabs, validates drafts, cancels, applies, and reopens current values", () => {
    const { container, root } = renderSettings();
    const open = container.querySelector<HTMLButtonElement>("button")!;
    act(() => open.click());

    const tabs = [
      ...container.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    ];
    expect(tabs.map((tab) => tab.textContent)).toEqual(["General", "Audio"]);
    expect(
      [...container.querySelectorAll<HTMLButtonElement>("button")].find(
        (button) => button.textContent === "Apply",
      )?.disabled,
    ).toBe(true);
    expect(
      [...container.querySelectorAll<HTMLButtonElement>("button")].find(
        (button) => button.textContent === "Save",
      )?.disabled,
    ).toBe(true);
    act(() =>
      tabs[0].dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      ),
    );
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");

    act(() => tabs[1].click());
    const multitrack = container.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    )!;
    const leadRegex = container.querySelector<HTMLInputElement>(
      'input[value="lead"]',
    )!;
    expect(leadRegex.disabled).toBe(true);
    act(() => multitrack.click());
    expect(leadRegex.disabled).toBe(false);
    act(() => multitrack.click());
    expect(leadRegex.disabled).toBe(true);
    const audioPath = container.querySelector<HTMLInputElement>(
      'input:not([type="checkbox"])',
    )!;
    act(() => changeInput(audioPath, ""));
    act(() =>
      [...container.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent === "Apply")!
        .click(),
    );
    expect(container.textContent).toContain("Audio Path is required.");
    expect(container.querySelector("output")?.textContent).toBe("~");

    act(() =>
      [...container.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent === "Cancel")!
        .click(),
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    act(() => open.click());
    act(() =>
      container.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click(),
    );
    expect(
      container.querySelector<HTMLInputElement>('input:not([type="checkbox"])')
        ?.value,
    ).toBe("~");

    act(() =>
      changeInput(
        container.querySelector<HTMLInputElement>(
          'input:not([type="checkbox"])',
        )!,
        "C:/audio",
      ),
    );
    act(() =>
      [...container.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent === "Apply")!
        .click(),
    );
    expect(container.querySelector("output")?.textContent).toBe("C:/audio");
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(
      [...container.querySelectorAll<HTMLButtonElement>("button")].find(
        (button) => button.textContent === "Save",
      )?.disabled,
    ).toBe(true);
    act(() =>
      changeInput(
        container.querySelector<HTMLInputElement>(
          'input:not([type="checkbox"])',
        )!,
        "D:/audio",
      ),
    );
    act(() =>
      [...container.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent === "Save")!
        .click(),
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    act(() => open.click());
    act(() =>
      container.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click(),
    );
    expect(
      container.querySelector<HTMLInputElement>('input:not([type="checkbox"])')
        ?.value,
    ).toBe("D:/audio");
    root.unmount();
    container.remove();
  });
});
