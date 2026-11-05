import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useEditor } from "../../../hooks/useEditorState";
import { runAction } from "../../../actions/execute";
import Platform from "../../../platform";
import { SettingsService } from "../../../services/settings/settings";
import { DefaultApplicationSettings } from "../../../services/settings/schema";
import { useSettings } from "../../../hooks/useApplication";
import { Runtime } from "../../editor/Runtime";
import { SettingsDialog } from "./SettingsDialog";
import { mockWorkspaceService } from "../../../services/workspace/__tests__/utils";

function SettingsTestShell() {
  const { settingsVisible } = useEditor();
  const { settings } = useSettings();
  return (
    <>
      <button type="button" onClick={() => runAction("dialog.open-settings")}>
        Open settings
      </button>
      <output>
        {settings.feedback.metronomeEnabled ? "enabled" : "disabled"}
      </output>
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
      <Runtime>
        <SettingsTestShell />
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

describe("Application settings", () => {
  const resetSettings = (): void => {
    Platform.services.get<SettingsService>("settings").reset();
    localStorage.clear();
  };

  beforeEach(resetSettings);
  afterEach(resetSettings);

  it("has valid versioned defaults", () => {
    expect(DefaultApplicationSettings.version).toBe(1);
    expect(DefaultApplicationSettings).not.toHaveProperty("audio");
    expect(DefaultApplicationSettings).not.toHaveProperty("discovery");
    expect(DefaultApplicationSettings.history.capacity).toBe(256);

    // expect(validateApplicationSettings(DefaultApplicationSettings)).toEqual({});
  });

  it("discards legacy audio and discovery settings when loading and saving", () => {
    localStorage.setItem(
      "openchart.application-settings",
      JSON.stringify({
        ...DefaultApplicationSettings,
        saving: { defaultSaveMode: "project" },
        audio: { rootPath: "/legacy", multitrack: true },
        discovery: { songRegex: "legacy" },
        feedback: {
          ...DefaultApplicationSettings.feedback,
          metronomeEnabled: true,
        },
      }),
    );
    const service = new SettingsService(mockWorkspaceService());
    service.load();
    expect(service.getSnapshot()).not.toHaveProperty("audio");
    expect(service.getSnapshot()).not.toHaveProperty("discovery");
    expect(service.getSnapshot()).not.toHaveProperty("saving");
    expect(service.getSnapshot().feedback.metronomeEnabled).toBe(true);
    expect(service.applySettings(service.getSnapshot())).toBe(true);
    const saved = JSON.parse(
      localStorage.getItem("openchart.application-settings")!,
    );
    expect(saved).not.toHaveProperty("audio");
    expect(saved).not.toHaveProperty("discovery");
    expect(saved).not.toHaveProperty("saving");
  });

  it("validates the history capacity range", () => {
    const settings = structuredClone(DefaultApplicationSettings);
    settings.history.capacity = 0;
    settings.history.capacity = 1025;
    settings.history.capacity = 1024;
  });

  it("shows and persists the bounded history capacity", async () => {
    const { container, root } = renderSettings();
    const open = container.querySelector<HTMLButtonElement>("button")!;
    act(() => open.click());

    const capacity = container.querySelector<HTMLInputElement>(
      'input[type="number"]',
    )!;
    expect(capacity.value).toBe("256");
    expect(capacity.min).toBe("1");
    expect(capacity.max).toBe("1024");
    expect(capacity.step).toBe("1");

    act(() => changeInput(capacity, "0"));
    act(() =>
      [...container.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent === "Apply")!
        .click(),
    );
    expect(container.textContent).toContain(
      "History capacity must be an integer from 1 to 1024.",
    );

    act(() => changeInput(capacity, "1024"));
    await act(async () => {
      [...container.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent === "OK")!
        .click();
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
    });
    act(() => open.click());
    expect(
      container.querySelector<HTMLInputElement>('input[type="number"]')?.value,
    ).toBe("1024");

    act(() => root.unmount());
    container.remove();
  });

  it("keeps feedback settings available and persists metronome changes", async () => {
    const { container, root } = renderSettings();
    const open = container.querySelector<HTMLButtonElement>("button")!;
    act(() => open.click());

    const tabs = [
      ...container.querySelectorAll<HTMLElement>(
        '#dialog-sections [role="option"]',
      ),
    ];
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "General",
      "Workspace",
      "Feedback",
      "Display",
    ]);
    expect(
      [...container.querySelectorAll<HTMLButtonElement>("button")].find(
        (button) => button.textContent === "Apply",
      )?.disabled,
    ).toBe(true);
    expect(
      [...container.querySelectorAll<HTMLButtonElement>("button")].find(
        (button) => button.textContent === "OK",
      )?.disabled,
    ).toBe(true);
    act(() => {
      tabs[0].focus();
      tabs[0].dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      );
    });
    expect(document.activeElement).toBe(tabs[1]);
    act(() => {
      tabs[1].dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      );
    });
    expect(document.activeElement).toBe(tabs[2]);
    expect(container.textContent).toContain("Enable metronome");
    expect(container.textContent).toContain("Metronome Volume");
    expect(container.textContent).toContain("Downbeat Sound");
    expect(container.textContent).toContain("Beat Sound");
    expect(container.textContent).not.toMatch(/WAV|Audio Folder|Multitrack/);
    const metronome = container.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    )!;
    expect(metronome.checked).toBe(false);
    act(() => metronome.click());
    act(() =>
      [...container.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent === "Apply")!
        .click(),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.querySelector("output")?.textContent).toBe("enabled");
    act(() => root.unmount());
    container.remove();
  });

  it("shows and applies the antialiasing checkbox", async () => {
    const { container, root } = renderSettings();
    const open = container.querySelector<HTMLButtonElement>("button")!;
    act(() => open.click());

    const displayTab = [
      ...container.querySelectorAll<HTMLElement>(
        '#dialog-sections [role="option"]',
      ),
    ].find((tab) => tab.textContent === "Display")!;
    act(() => displayTab.click());

    const antialiasing = container.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    )!;
    expect(antialiasing.checked).toBe(true);
    act(() => antialiasing.click());
    const scrollSpeed = container.querySelector<HTMLInputElement>(
      'input[type="number"]',
    )!;
    expect(scrollSpeed.value).toBe("1");
    expect(scrollSpeed.min).toBe("0.5");
    expect(scrollSpeed.max).toBe("4");
    act(() => changeInput(scrollSpeed, "2"));
    await act(async () => {
      [...container.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent === "Apply")!
        .click();
      await Promise.resolve();
    });

    expect(
      Platform.services.get<SettingsService>("settings").getSettings().display
        .antialiasing,
    ).toBe(false);
    expect(
      Platform.services.get<SettingsService>("settings").getSettings().display
        .scrollSpeed,
    ).toBe(2);
    act(() => root.unmount());
    container.remove();
  });
});
