import { z } from "zod";

export const ApplicationSettingsVersion = 1;
export const StorageKey = "openchart.application-settings";

export const HighwayScrollSpeedRange = {
  min: 0.5,
  max: 4,
  step: 0.1,
} as const;

export const OscillatorType = {
  Sine: "sine",
  Square: "square",
  Sawtooth: "sawtooth",
  Triangle: "triangle",
} as const;

export const FileSystemDirectoryHandleSchema =
  z.custom<FileSystemDirectoryHandle>(
    (value) =>
      typeof FileSystemDirectoryHandle !== "undefined" &&
      value instanceof FileSystemDirectoryHandle,
  );

const WorkspaceSchema = z.object({
  uri: z.directoryPicker().meta({ label: "Workspace Path" }),
});

const FeedbackSchema = z
  .object({
    metronomeEnabled: z.boolean().meta({ label: "Enable metronome" }),
    metronomeVolume: z
      .number()
      .min(0, "Metronome volume must be between 0 and 1.")
      .max(1, "Metronome volume must be between 0 and 1.")
      .meta({ label: "Metronome volume", min: 0, max: 1, step: 0.01 }),
    metronomeDownbeatSound: z
      .enum(OscillatorType)
      .meta({ label: "Downbeat sound" }),
    metronomeBeatSound: z.enum(OscillatorType).meta({ label: "Beat sound" }),
    previewVolume: z
      .number()
      .min(0, "Preview volume must be between 0 and 1.")
      .max(1, "Preview volume must be between 0 and 1.")
      .meta({ label: "Preview volume", min: 0, max: 1, step: 0.01 }),
    previewAttackMs: z.number().meta({ label: "Preview attack (ms)", min: 0 }),
    previewReleaseMs: z
      .number()
      .meta({ label: "Preview release (ms)", min: 0 }),
    previewMaxVoices: z
      .number()
      .int()
      .min(1, "Preview voice count must be at least 1.")
      .meta({ label: "Preview voice count", min: 1, step: 1 }),
    previewLowPitch: z
      .number()
      .int()
      .min(0)
      .max(127)
      .meta({ label: "Preview low pitch", min: 0, max: 127, step: 1 }),
    previewHighPitch: z
      .number()
      .int()
      .min(0)
      .max(127)
      .meta({ label: "Preview high pitch", min: 0, max: 127, step: 1 }),
  })
  .meta({ tab: "Feedback" });

const HistorySchema = z
  .object({
    capacity: z
      .number()
      .int()
      .min(1, "History capacity must be an integer from 1 to 1024.")
      .max(1024, "History capacity must be an integer from 1 to 1024.")
      .meta({ label: "History capacity", min: 1, max: 1024, step: 1 }),
  })
  .meta({ tab: "General" });

const DisplaySchema = z
  .object({
    antialiasing: z.boolean().meta({ label: "Antialiasing" }),
    scrollSpeed: z
      .number()
      .min(
        HighwayScrollSpeedRange.min,
        `Highway visual speed must be between ${HighwayScrollSpeedRange.min} and ${HighwayScrollSpeedRange.max}.`,
      )
      .max(
        HighwayScrollSpeedRange.max,
        `Highway visual speed must be between ${HighwayScrollSpeedRange.min} and ${HighwayScrollSpeedRange.max}.`,
      )
      .multipleOf(HighwayScrollSpeedRange.step)
      .meta({
        label: "Highway visual speed",
        min: HighwayScrollSpeedRange.min,
        max: HighwayScrollSpeedRange.max,
        step: HighwayScrollSpeedRange.step,
      }),
  })
  .meta({ tab: "Display" });

export const ApplicationSettingsSchema = z.object({
  version: z
    .literal(ApplicationSettingsVersion, {
      error: "Unsupported settings version.",
    })
    .meta({ hidden: true }),
  workspace: WorkspaceSchema,
  feedback: FeedbackSchema,
  history: HistorySchema,
  display: DisplaySchema,
});

export type ApplicationSettings = z.infer<typeof ApplicationSettingsSchema>;

export type ApplicationSettingGroup = Exclude<
  keyof ApplicationSettings,
  "version"
>;

export type ApplicationSettingPath = {
  [Group in ApplicationSettingGroup]: `${Group}.${Extract<
    keyof ApplicationSettings[Group],
    string
  >}`;
}[ApplicationSettingGroup];

export type ApplicationSettingValue<Path extends ApplicationSettingPath> =
  Path extends `${infer Group}.${infer Key}`
    ? Group extends ApplicationSettingGroup
      ? Key extends keyof ApplicationSettings[Group]
        ? ApplicationSettings[Group][Key]
        : never
      : never
    : never;

export const DefaultApplicationSettings: ApplicationSettings = {
  version: ApplicationSettingsVersion,
  workspace: {
    uri: null,
  },
  feedback: {
    metronomeEnabled: false,
    metronomeVolume: 0.35,
    metronomeDownbeatSound: "square",
    metronomeBeatSound: "sine",
    previewVolume: 0.25,
    previewAttackMs: 8,
    previewReleaseMs: 80,
    previewMaxVoices: 8,
    previewLowPitch: 36,
    previewHighPitch: 60,
  },
  history: {
    capacity: 256,
  },
  display: {
    antialiasing: true,
    scrollSpeed: 1,
  },
};
