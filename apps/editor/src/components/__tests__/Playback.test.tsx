import { act, StrictMode, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { Runtime } from "../Runtime";
import { usePlayback } from "../../hooks/usePlayback";
import Platform from "../../platform";
import { AudioService } from "../../services/audio";
import {
  defaultApplicationSettings,
  SettingsService,
} from "../../services/settings";

function FeedbackConsumer() {
  const { setActiveView, stopPreview } = usePlayback();

  useEffect(() => {
    setActiveView("highway");
    stopPreview();
  }, [setActiveView, stopPreview]);

  return null;
}

describe("Playback", () => {
  it("makes feedback available before descendant effects run", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root: Root = createRoot(container);

    expect(() =>
      act(() => {
        root.render(
          <StrictMode>
            <Runtime>
              <FeedbackConsumer />
            </Runtime>
          </StrictMode>,
        );
      }),
    ).not.toThrow();

    act(() => root.unmount());
    container.remove();
  });

  it("rediscovers audio only when audio discovery settings change", () => {
    const audio = Platform.services.get<AudioService>("audio");
    const settings = Platform.services.get<SettingsService>("settings");
    const originalSettings = settings.getSettings();
    const initialSettings = structuredClone(defaultApplicationSettings);
    settings.applySettings(initialSettings);

    const discoverAudio = vi
      .spyOn(audio, "discoverAudio")
      .mockResolvedValue(null);
    const container = document.createElement("div");
    document.body.append(container);
    const root: Root = createRoot(container);

    try {
      act(() => root.render(<Runtime>{null}</Runtime>));
      discoverAudio.mockClear();

      act(() => {
        settings.applySettings({
          ...initialSettings,
          history: { ...initialSettings.history, capacity: 512 },
        });
      });
      expect(discoverAudio).not.toHaveBeenCalled();

      act(() => {
        settings.applySettings({
          ...settings.getSettings(),
          audio: { ...settings.getSettings().audio, rootPath: "C:/audio" },
        });
      });
      expect(discoverAudio).toHaveBeenCalledTimes(1);

      act(() => {
        settings.applySettings({
          ...settings.getSettings(),
          audio: { ...settings.getSettings().audio, multitrack: true },
        });
      });
      expect(discoverAudio).toHaveBeenCalledTimes(2);
    } finally {
      act(() => root.unmount());
      container.remove();
      discoverAudio.mockRestore();
      settings.applySettings(originalSettings);
    }
  });
});
