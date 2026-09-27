import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export const APPLICATION_SETTINGS_VERSION = 1;
const STORAGE_KEY = "midiedit.application-settings";

export interface ApplicationSettings {
  version: typeof APPLICATION_SETTINGS_VERSION;
  audio: {
    rootPath: string;
    multitrack: boolean;
    mode: "single" | "multitrack";
  };
  feedback: {
    metronomeEnabled: boolean;
    metronomeVolume: number;
    metronomeDownbeatSound: OscillatorType;
    metronomeBeatSound: OscillatorType;
    previewVolume: number;
    previewAttackMs: number;
    previewReleaseMs: number;
    previewMaxVoices: number;
    previewLowPitch: number;
    previewHighPitch: number;
  };
  discovery: {
    songRegex: string;
    leadRegex: string;
    rhythmRegex: string;
    bassRegex: string;
    drumsRegex: string;
    vocalsRegex: string;
    harmoniesRegex: string;
    synthRegex: string;
    otherRegex: string;
  };
  saving: {
    defaultSaveMode: "project" | "midi";
  };
  history: {
    capacity: number;
  };
}

export const defaultApplicationSettings: ApplicationSettings = {
  version: APPLICATION_SETTINGS_VERSION,
  audio: { rootPath: "~", multitrack: false, mode: "single" },
  feedback: {
    metronomeEnabled: false,
    metronomeVolume: 0.35,
    metronomeDownbeatSound: "square",
    metronomeBeatSound: "sine",
    previewVolume: 0.25,
    previewAttackMs: 8,
    previewReleaseMs: 80,
    previewMaxVoices: 8,
    // Inclusive MIDI pitch bounds: C2 through C4.
    previewLowPitch: 36,
    previewHighPitch: 60,
  },
  discovery: {
    songRegex: "song",
    leadRegex: "lead",
    rhythmRegex: "rhythm",
    bassRegex: "bass",
    drumsRegex: "drums",
    vocalsRegex: "vocals",
    harmoniesRegex: "harmonies",
    synthRegex: "synth",
    otherRegex: "other",
  },
  saving: { defaultSaveMode: "project" },
  history: { capacity: 256 },
};

export function validateApplicationSettings(
  settings: ApplicationSettings,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (settings.version !== APPLICATION_SETTINGS_VERSION) {
    errors.version = "Unsupported settings version.";
  }
  if (!settings.audio.rootPath.trim()) {
    errors.rootPath = "Audio Path is required.";
  }
  if (
    settings.audio.mode !== undefined &&
    settings.audio.mode !== "single" &&
    settings.audio.mode !== "multitrack"
  ) {
    errors.audioMode = "Choose a supported audio mode.";
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
  const discoveryFields = settings.audio.multitrack
    ? Object.entries(settings.discovery).filter(
        ([field]) => field !== "songRegex",
      )
    : [["songRegex", settings.discovery.songRegex] as const];
  for (const [field, expression] of discoveryFields) {
    try {
      new RegExp(expression);
    } catch {
      errors[field] = "Enter a valid regular expression.";
    }
  }
  if (!["project", "midi"].includes(settings.saving.defaultSaveMode)) {
    errors.defaultSaveMode = "Select a valid default save mode.";
  }
  return errors;
}

function readSettings(): ApplicationSettings {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return defaultApplicationSettings;
    const parsed = JSON.parse(stored) as ApplicationSettings;
    const storedFeedback = Object.fromEntries(
      Object.entries(parsed.feedback ?? {}).filter(
        ([key]) => key !== "highwayClapEnabled" && key !== "highwayClapVolume",
      ),
    );
    const merged: ApplicationSettings = {
      ...defaultApplicationSettings,
      ...parsed,
      audio: { ...defaultApplicationSettings.audio, ...parsed.audio },
      feedback: { ...defaultApplicationSettings.feedback, ...storedFeedback },
      discovery: {
        ...defaultApplicationSettings.discovery,
        ...parsed.discovery,
      },
      saving: { ...defaultApplicationSettings.saving, ...parsed.saving },
      history: { ...defaultApplicationSettings.history, ...parsed.history },
    };
    merged.audio.mode = merged.audio.multitrack ? "multitrack" : "single";
    return Object.keys(validateApplicationSettings(merged)).length === 0
      ? merged
      : defaultApplicationSettings;
  } catch {
    return defaultApplicationSettings;
  }
}

interface ApplicationSettingsContextValue {
  settings: ApplicationSettings;
  applySettings: (settings: ApplicationSettings) => boolean;
}

const ApplicationSettingsContext = createContext<
  ApplicationSettingsContextValue | undefined
>(undefined);

export function ApplicationSettingsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [settings, setSettings] = useState<ApplicationSettings>(readSettings);
  const value = useMemo<ApplicationSettingsContextValue>(
    () => ({
      settings,
      applySettings: (nextSettings) => {
        if (Object.keys(validateApplicationSettings(nextSettings)).length > 0) {
          return false;
        }
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSettings));
        setSettings(nextSettings);
        return true;
      },
    }),
    [settings],
  );
  return (
    <ApplicationSettingsContext.Provider value={value}>
      {children}
    </ApplicationSettingsContext.Provider>
  );
}

export function useApplicationSettings(): ApplicationSettingsContextValue {
  const context = useContext(ApplicationSettingsContext);
  if (!context) {
    throw new Error(
      "useApplicationSettings must be used within an ApplicationSettingsProvider",
    );
  }
  return context;
}
