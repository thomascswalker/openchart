import { IStatefulService } from "../platform/services";
import {
  APPLICATION_SETTINGS_VERSION,
  HIGHWAY_SCROLL_SPEED_RANGE,
  STORAGE_KEY,
  defaultApplicationSettings,
  type ApplicationSettingGroup,
  type ApplicationSettingPath,
  type ApplicationSettingValue,
  type ApplicationSettings,
} from "./settings/schema";

export function validateApplicationSettings(
  settings: ApplicationSettings,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (settings.version !== APPLICATION_SETTINGS_VERSION) {
    errors.version = "Unsupported settings version.";
  }
  if (
    !Number.isFinite(settings.feedback.metronomeVolume) ||
    settings.feedback.metronomeVolume < 0 ||
    settings.feedback.metronomeVolume > 1
  ) {
    errors.metronomeVolume = "Metronome volume must be between 0 and 1.";
  }
  if (
    !Number.isFinite(settings.feedback.previewVolume) ||
    settings.feedback.previewVolume < 0 ||
    settings.feedback.previewVolume > 1
  ) {
    errors.previewVolume = "Preview volume must be between 0 and 1.";
  }
  if (
    !["sine", "square", "sawtooth", "triangle"].includes(
      settings.feedback.metronomeDownbeatSound,
    ) ||
    !["sine", "square", "sawtooth", "triangle"].includes(
      settings.feedback.metronomeBeatSound,
    )
  ) {
    errors.metronomeDownbeatSound = "Choose a supported metronome sound.";
    errors.metronomeBeatSound = "Choose a supported metronome sound.";
  }
  if (
    !Number.isInteger(settings.feedback.previewMaxVoices) ||
    settings.feedback.previewMaxVoices < 1
  ) {
    errors.previewMaxVoices = "Preview voice count must be at least 1.";
  }
  if (
    !Number.isInteger(settings.history.capacity) ||
    settings.history.capacity < 1 ||
    settings.history.capacity > 1024
  ) {
    errors.historyCapacity =
      "History capacity must be an integer from 1 to 1024.";
  }
  if (
    !Number.isInteger(settings.feedback.previewLowPitch) ||
    !Number.isInteger(settings.feedback.previewHighPitch) ||
    settings.feedback.previewLowPitch < 0 ||
    settings.feedback.previewHighPitch > 127 ||
    settings.feedback.previewLowPitch > settings.feedback.previewHighPitch
  ) {
    errors.previewLowPitch =
      "Preview pitch range must be inclusive MIDI pitches 0–127.";
    errors.previewHighPitch =
      "Preview pitch range must be inclusive MIDI pitches 0–127.";
  }
  if (typeof settings.graphics.antialiasing !== "boolean") {
    errors.antialiasing = "Antialiasing must be enabled or disabled.";
  }
  if (
    !Number.isFinite(settings.graphics.scrollSpeed) ||
    settings.graphics.scrollSpeed < HIGHWAY_SCROLL_SPEED_RANGE.min ||
    settings.graphics.scrollSpeed > HIGHWAY_SCROLL_SPEED_RANGE.max
  ) {
    errors.scrollSpeed = `Highway visual speed must be between ${HIGHWAY_SCROLL_SPEED_RANGE.min} and ${HIGHWAY_SCROLL_SPEED_RANGE.max}.`;
  }
  return errors;
}

function readSettings(): ApplicationSettings {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return defaultApplicationSettings;
    const parsed = JSON.parse(stored) as Record<string, unknown>;
    const canonicalSettings = Object.fromEntries(
      Object.entries(parsed).filter(
        ([key]) => key !== "audio" && key !== "discovery" && key !== "saving",
      ),
    ) as Partial<ApplicationSettings>;
    const storedFeedback = Object.fromEntries(
      Object.entries((parsed.feedback ?? {}) as Record<string, unknown>).filter(
        ([key]) => key !== "highwayClapEnabled" && key !== "highwayClapVolume",
      ),
    );
    const parsedGraphics = (parsed.graphics ?? {}) as Record<string, unknown>;
    const storedGraphics = Object.fromEntries(
      Object.entries(parsedGraphics).filter(
        ([key]) => key !== "antialiasingQuality",
      ),
    );
    const savedAntialiasing = parsedGraphics.antialiasing;
    const legacyQuality = parsedGraphics.antialiasingQuality;
    const antialiasing =
      typeof savedAntialiasing === "boolean"
        ? savedAntialiasing
        : savedAntialiasing === "on"
          ? true
          : savedAntialiasing === "off"
            ? false
            : legacyQuality === "performance"
              ? false
              : legacyQuality === "balanced" || legacyQuality === "high"
                ? true
                : defaultApplicationSettings.graphics.antialiasing;
    const merged: ApplicationSettings = {
      ...defaultApplicationSettings,
      ...canonicalSettings,
      feedback: { ...defaultApplicationSettings.feedback, ...storedFeedback },
      history: {
        ...defaultApplicationSettings.history,
        ...(parsed.history as Partial<ApplicationSettings["history"]>),
      },
      graphics: {
        ...defaultApplicationSettings.graphics,
        ...storedGraphics,
        antialiasing,
      },
    };
    return Object.keys(validateApplicationSettings(merged)).length === 0
      ? merged
      : defaultApplicationSettings;
  } catch {
    return defaultApplicationSettings;
  }
}

export class SettingsService extends IStatefulService<ApplicationSettings> {
  constructor() {
    super();
    this._snapshot = readSettings();
  }

  public readonly reset = (): void => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(defaultApplicationSettings),
    );
    this._snapshot = defaultApplicationSettings;
    this.notify();
  };

  public readonly getSettings = (): ApplicationSettings => this._snapshot;

  public readonly load = (): void => {
    this._snapshot = readSettings();
    this.notify();
  };

  public readonly applySettings = (settings: ApplicationSettings): boolean => {
    if (Object.keys(validateApplicationSettings(settings)).length > 0) {
      return false;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    this._snapshot = settings;
    this.notify();
    return true;
  };

  public readonly applySetting = <Path extends ApplicationSettingPath>(
    path: Path,
    value: ApplicationSettingValue<Path>,
  ): boolean => {
    const [group, key] = path.split(".") as [ApplicationSettingGroup, string];
    const settings = {
      ...this._snapshot,
      [group]: { ...this._snapshot[group], [key]: value },
    } as ApplicationSettings;
    return this.applySettings(settings);
  };
}
