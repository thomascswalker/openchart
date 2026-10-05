import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorState } from "../../../hooks/useEditorState";
import { runAction } from "../../../actions/execute";
import Platform from "../../../platform";
import { AudioService } from "../../../services/audio";
import {
  defaultApplicationSettings,
  validateApplicationSettings,
} from "../../../services/settings";
import { useApplicationSettings } from "../../../hooks/useApplicationSettings";
import { Runtime } from "../../Runtime";
import { SettingsDialog } from "../SettingsDialog";

function SettingsTestShell() {
  const { settingsVisible } = useEditorState();
  const { settings } = useApplicationSettings();
  return (
    <>
      <button
        type="button"
        onClick={() => runAction("dialog.open-settings")}
      >
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

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe("Application settings", () => {
  beforeEach(() => localStorage.clear());

  it("has valid versioned defaults", () => {
    expect(defaultApplicationSettings.version).toBe(1);
    expect(defaultApplicationSettings.audio.rootPath).toBe("~");
    expect(defaultApplicationSettings.history.capacity).toBe(256);
    expect(validateApplicationSettings(defaultApplicationSettings)).toEqual({});
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

  it("lists files using the draft audio path", async () => {
    const audio = Platform.services.get<AudioService>("audio");
    const listDiscoveredFiles = vi
      .spyOn(audio, "listDiscoveredFiles")
      .mockResolvedValue(null);
    const { container, root } = renderSettings();

    act(() => container.querySelector<HTMLButtonElement>("button")!.click());
    await act(async () => {
      await Promise.resolve();
    });
    act(() =>
      container.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click(),
    );
    const audioPath = container.querySelector<HTMLInputElement>(
      'input:not([type="checkbox"])',
    )!;
    act(() => changeInput(audioPath, "C:/draft-audio"));
    await act(async () => {
      await Promise.resolve();
    });

    expect(listDiscoveredFiles).toHaveBeenCalledWith("C:/draft-audio");

    act(() => root.unmount());
    container.remove();
    listDiscoveredFiles.mockRestore();
  });

  it("ignores a slower file listing for an older draft path", async () => {
    const audio = Platform.services.get<AudioService>("audio");
    const earlier = deferred<string[] | null>();
    const later = deferred<string[] | null>();
    const listDiscoveredFiles = vi
      .spyOn(audio, "listDiscoveredFiles")
      .mockImplementation((rootPath) =>
        rootPath === "C:/newer-audio" ? later.promise : earlier.promise,
      );
    const { container, root } = renderSettings();

    act(() => container.querySelector<HTMLButtonElement>("button")!.click());
    await act(async () => {
      await Promise.resolve();
    });
    act(() =>
      container.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click(),
    );
    const songRegex = container.querySelector<HTMLInputElement>(
      'input[value="song"]',
    )!;
    act(() => changeInput(songRegex, "newer-match"));
    const audioPath = container.querySelector<HTMLInputElement>(
      'input:not([type="checkbox"])',
    )!;
    act(() => changeInput(audioPath, "C:/newer-audio"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(listDiscoveredFiles).toHaveBeenCalledWith("C:/newer-audio");

    await act(async () => {
      later.resolve(["newer-match.wav"]);
      await later.promise;
    });
    expect(
      container.querySelector('[aria-label="Matching audio file found"]'),
    ).not.toBeNull();

    await act(async () => {
      earlier.resolve(["old.wav"]);
      await earlier.promise;
    });
    expect(
      container.querySelector('[aria-label="Matching audio file found"]'),
    ).not.toBeNull();

    act(() => root.unmount());
    container.remove();
    listDiscoveredFiles.mockRestore();
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
        .find((button) => button.textContent === "Save")!
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

  it("navigates tabs, validates drafts, cancels, applies, and reopens current values", async () => {
    const { container, root } = renderSettings();
    const open = container.querySelector<HTMLButtonElement>("button")!;
    act(() => open.click());

    const tabs = [
      ...container.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    ];
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "General",
      "Audio",
      "Feedback",
    ]);
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
    const songRegex = container.querySelector<HTMLInputElement>(
      'input[value="song"]',
    )!;
    expect(songRegex.disabled).toBe(false);
    expect(leadRegex.disabled).toBe(true);
    act(() => multitrack.click());
    expect(songRegex.disabled).toBe(true);
    expect(leadRegex.disabled).toBe(false);
    act(() => multitrack.click());
    expect(songRegex.disabled).toBe(false);
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
    await act(async () => {
      [...container.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent === "Save")!
        .click();
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
    });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    act(() => open.click());
    act(() =>
      container.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click(),
    );
    expect(
      container.querySelector<HTMLInputElement>('input:not([type="checkbox"])')
        ?.value,
    ).toBe("D:/audio");
    act(() => root.unmount());
    container.remove();
  });
});
