import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useEditorState } from "../../../hooks/useEditorState";
import { runAction } from "../../../actions/execute";
import Platform from "../../../platform";
import {
  defaultApplicationSettings,
  validateApplicationSettings,
  SettingsService,
} from "../../../services/settings";
import { useApplicationSettings } from "../../../hooks/useApplicationSettings";
import { Runtime } from "../../Runtime";
import { SettingsDialog } from "../SettingsDialog";

function SettingsTestShell() {
  const { settingsVisible } = useEditorState();
  const { settings } = useApplicationSettings();
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
    HTMLInputElement.prototype,
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
    expect(defaultApplicationSettings.version).toBe(1);
    expect(defaultApplicationSettings).not.toHaveProperty("audio");
    expect(defaultApplicationSettings).not.toHaveProperty("discovery");
    expect(defaultApplicationSettings.history.capacity).toBe(256);
    expect(validateApplicationSettings(defaultApplicationSettings)).toEqual({});
  });

  it("discards legacy audio and discovery settings when loading and saving", () => {
    localStorage.setItem(
      "midiedit.application-settings",
      JSON.stringify({
        ...defaultApplicationSettings,
        audio: { rootPath: "/legacy", multitrack: true },
        discovery: { songRegex: "legacy" },
        feedback: {
          ...defaultApplicationSettings.feedback,
          metronomeEnabled: true,
        },
      }),
    );
    const service = new SettingsService();
    service.load();
    expect(service.getSnapshot()).not.toHaveProperty("audio");
    expect(service.getSnapshot()).not.toHaveProperty("discovery");
    expect(service.getSnapshot().feedback.metronomeEnabled).toBe(true);
    expect(service.applySettings(service.getSnapshot())).toBe(true);
    const saved = JSON.parse(
      localStorage.getItem("midiedit.application-settings")!,
    );
    expect(saved).not.toHaveProperty("audio");
    expect(saved).not.toHaveProperty("discovery");
  });

  it("validates the history capacity range", () => {
    const settings = structuredClone(defaultApplicationSettings);
    settings.history.capacity = 0;
    expect(validateApplicationSettings(settings).historyCapacity).toBeDefined();
    settings.history.capacity = 1025;
    expect(validateApplicationSettings(settings).historyCapacity).toBeDefined();
    settings.history.capacity = 1024;
    expect(
      validateApplicationSettings(settings).historyCapacity,
    ).toBeUndefined();
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
    expect(tabs.map((tab) => tab.textContent)).toEqual(["General", "Feedback"]);
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
    expect(container.textContent).toContain("Enable metronome");
    expect(container.textContent).toContain("Metronome volume");
    expect(container.textContent).toContain("Downbeat sound");
    expect(container.textContent).toContain("Beat sound");
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
});
