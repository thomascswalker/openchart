import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useEditorCommands } from "../commands/EditorCommand";
import { Audio } from "ts-audio";
import { AUDIO_ROLES } from "../hooks/useAudioPlayer";
import {
  type ApplicationSettings,
  useApplicationSettings,
  validateApplicationSettings,
} from "../context/ApplicationSettingsContext";
import { usePlayback } from "../context/PlaybackContextStore";
import { useEditor } from "../context/EditorContext";
import { matchesAudioFile } from "../util/audioDiscovery";
import { Modal } from "./shared/Modal/Modal";

type SettingsTab = string;
type SettingsControl = "text" | "number" | "checkbox" | "select";

interface SettingsField {
  id: string;
  label: string;
  control: SettingsControl;
  path: `${"audio" | "discovery" | "saving" | "feedback"}.${string}`;
  options?: ReadonlyArray<{ label: string; value: string }>;
  enabledWhen?: (settings: ApplicationSettings) => boolean;
}

const audioDiscoveryFields: SettingsField[] = [
  {
    id: "songRegex",
    label: "Song regex",
    control: "text",
    path: "discovery.songRegex",
    enabledWhen: (settings) => !settings.audio.multitrack,
  },
  {
    id: "leadRegex",
    label: "Lead regex",
    control: "text",
    path: "discovery.leadRegex",
    enabledWhen: (settings) => settings.audio.multitrack,
  },
  {
    id: "rhythmRegex",
    label: "Rhythm regex",
    control: "text",
    path: "discovery.rhythmRegex",
    enabledWhen: (settings) => settings.audio.multitrack,
  },
  {
    id: "bassRegex",
    label: "Bass regex",
    control: "text",
    path: "discovery.bassRegex",
    enabledWhen: (settings) => settings.audio.multitrack,
  },
  {
    id: "drumsRegex",
    label: "Drums regex",
    control: "text",
    path: "discovery.drumsRegex",
    enabledWhen: (settings) => settings.audio.multitrack,
  },
  {
    id: "vocalsRegex",
    label: "Vocals regex",
    control: "text",
    path: "discovery.vocalsRegex",
    enabledWhen: (settings) => settings.audio.multitrack,
  },
  {
    id: "harmoniesRegex",
    label: "Harmonies regex",
    control: "text",
    path: "discovery.harmoniesRegex",
    enabledWhen: (settings) => settings.audio.multitrack,
  },
  {
    id: "synthRegex",
    label: "Synth regex",
    control: "text",
    path: "discovery.synthRegex",
    enabledWhen: (settings) => settings.audio.multitrack,
  },
  {
    id: "otherRegex",
    label: "Other regex",
    control: "text",
    path: "discovery.otherRegex",
    enabledWhen: (settings) => settings.audio.multitrack,
  },
];

const settingsSchema: Record<string, SettingsField[]> = {
  General: [
    {
      id: "defaultSaveMode",
      label: "Default save mode",
      control: "select",
      path: "saving.defaultSaveMode",
      options: [
        { label: "Project", value: "project" },
        { label: "MIDI", value: "midi" },
      ],
    },
  ],
  Audio: [
    {
      id: "rootPath",
      label: "Audio Path",
      control: "text",
      path: "audio.rootPath",
    },
    {
      id: "multitrack",
      label: "Use multitrack audio",
      control: "checkbox",
      path: "audio.multitrack",
    },
    ...audioDiscoveryFields,
  ],
  Feedback: [
    {
      id: "metronomeEnabled",
      label: "Enable metronome",
      control: "checkbox",
      path: "feedback.metronomeEnabled",
    },
    {
      id: "metronomeVolume",
      label: "Metronome volume",
      control: "number",
      path: "feedback.metronomeVolume",
    },
    {
      id: "metronomeDownbeatSound",
      label: "Downbeat sound",
      control: "select",
      path: "feedback.metronomeDownbeatSound",
      options: [
        { label: "Sine", value: "sine" },
        { label: "Square", value: "square" },
        { label: "Triangle", value: "triangle" },
        { label: "Sawtooth", value: "sawtooth" },
      ],
    },
    {
      id: "metronomeBeatSound",
      label: "Beat sound",
      control: "select",
      path: "feedback.metronomeBeatSound",
      options: [
        { label: "Sine", value: "sine" },
        { label: "Square", value: "square" },
        { label: "Triangle", value: "triangle" },
        { label: "Sawtooth", value: "sawtooth" },
      ],
    },
    {
      id: "previewVolume",
      label: "Piano preview volume",
      control: "number",
      path: "feedback.previewVolume",
    },
    {
      id: "previewLowPitch",
      label: "Preview lowest MIDI pitch",
      control: "number",
      path: "feedback.previewLowPitch",
    },
    {
      id: "previewHighPitch",
      label: "Preview highest MIDI pitch",
      control: "number",
      path: "feedback.previewHighPitch",
    },
  ],
};

const tabs = Object.keys(settingsSchema);

function getSettingValue(
  settings: ApplicationSettings,
  path: SettingsField["path"],
): string | number | boolean {
  const [group, key] = path.split(".") as [
    keyof Pick<
      ApplicationSettings,
      "audio" | "discovery" | "saving" | "feedback"
    >,
    string,
  ];
  return (settings[group] as Record<string, string | number | boolean>)[key];
}

function setSettingValue(
  settings: ApplicationSettings,
  path: SettingsField["path"],
  value: string | number | boolean,
): ApplicationSettings {
  const [group, key] = path.split(".") as [
    keyof Pick<
      ApplicationSettings,
      "audio" | "discovery" | "saving" | "feedback"
    >,
    string,
  ];
  return {
    ...settings,
    [group]: { ...settings[group], [key]: value },
  } as ApplicationSettings;
}

const SettingsDialog = () => {
  const {
    dispatch,
    canExecute,
    audioDirectoryName,
    audioDirectorySupported,
    listDiscoveredAudioFileNames,
    markDirty,
  } = useEditorCommands();
  const {
    sources,
    setAudioSource,
    clearAudioSource,
    setSourceEnabled,
    setSourceVolume,
  } = usePlayback();
  const { projectMetadata, setProjectMetadata } = useEditor();
  const { settings, applySettings } = useApplicationSettings();
  const [selectedTab, setSelectedTab] = useState<SettingsTab>(tabs[0]);
  const [draft, setDraft] = useState<ApplicationSettings>(settings);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [audioFileNames, setAudioFileNames] = useState<string[] | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const refreshAudioFileNames = (): void => {
    void listDiscoveredAudioFileNames().then(setAudioFileNames);
  };

  useEffect(() => {
    refreshAudioFileNames();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.audio.rootPath, audioDirectoryName]);

  const close = (): void => void dispatch("close-settings");
  const selectTab = (tab: SettingsTab): void => {
    setSelectedTab(tab);
    setErrors({});
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [
      ...(dialogRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), select:not([disabled])",
      ) ?? []),
    ];
    const currentIndex = focusable.indexOf(
      document.activeElement as HTMLElement,
    );
    const nextIndex = event.shiftKey
      ? currentIndex <= 0
        ? focusable.length - 1
        : currentIndex - 1
      : currentIndex === focusable.length - 1
        ? 0
        : currentIndex + 1;
    event.preventDefault();
    focusable[nextIndex]?.focus();
  };
  const onTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ): void => {
    if (
      !(
        [
          "ArrowRight",
          "ArrowLeft",
          "ArrowDown",
          "ArrowUp",
          "Home",
          "End",
        ] as string[]
      ).includes(event.key)
    )
      return;
    event.preventDefault();
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabs.length - 1
          : (index +
              (event.key === "ArrowRight" || event.key === "ArrowDown"
                ? 1
                : -1) +
              tabs.length) %
            tabs.length;
    selectTab(tabs[nextIndex]);
    tabRefs.current[nextIndex]?.focus();
  };
  const apply = (): boolean => {
    const validationErrors = validateApplicationSettings(draft);
    setErrors(validationErrors);
    return Object.keys(validationErrors).length === 0 && applySettings(draft);
  };
  const save = (): void => {
    if (apply()) close();
  };
  const syncPortableAudio = (
    role: string,
    source: { fileName: string; enabled: boolean; volume: number } | null,
  ): void => {
    const current = projectMetadata.Audio ?? {
      Mode: draft.audio.multitrack ? "multitrack" : "single",
      Sources: {},
    };
    const sources = { ...current.Sources };
    if (source)
      sources[role as keyof typeof sources] = {
        FileName: source.fileName,
        Enabled: source.enabled,
        Volume: source.volume,
      };
    else delete sources[role as keyof typeof sources];
    setProjectMetadata({
      ...projectMetadata,
      Audio: {
        Mode: draft.audio.multitrack ? "multitrack" : "single",
        Sources: sources,
      },
    });
  };
  const fields = settingsSchema[selectedTab] ?? [];
  const isDirty = JSON.stringify(draft) !== JSON.stringify(settings);

  return (
    <Modal
      dialogRef={dialogRef}
      onKeyDown={onKeyDown}
      size={{ width: 760, height: 480, margin: 32 }}
      onBackdropClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <Modal.Header title="Settings" onClick={close} />
      <div className="settings-body">
        <div
          className="settings-tabs"
          role="tablist"
          aria-label="Settings sections"
          aria-orientation="vertical"
        >
          {tabs.map((tab, index) => (
            <button
              key={tab}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              type="button"
              role="tab"
              id={`settings-tab-${index}`}
              aria-selected={selectedTab === tab}
              aria-controls={`settings-panel-${index}`}
              tabIndex={selectedTab === tab ? 0 : -1}
              onClick={() => selectTab(tab)}
              onKeyDown={(event) => onTabKeyDown(event, index)}
            >
              {tab}
            </button>
          ))}
        </div>
        <div
          className="settings-panel"
          role="tabpanel"
          id={`settings-panel-${tabs.indexOf(selectedTab)}`}
          aria-labelledby={`settings-tab-${tabs.indexOf(selectedTab)}`}
        >
          {fields.map((field) => {
            const value = getSettingValue(draft, field.path);
            const enabled = field.enabledWhen?.(draft) ?? true;
            const isDiscoveryField = field.path.startsWith("discovery.");
            const isFound = isDiscoveryField
              ? audioFileNames === null
                ? null
                : matchesAudioFile(audioFileNames, value as string)
              : null;
            const update = (nextValue: string | number | boolean): void => {
              const next = setSettingValue(draft, field.path, nextValue);
              if (field.id === "multitrack") {
                next.audio.mode = nextValue ? "multitrack" : "single";
              }
              setDraft(next);
            };
            return (
              <label key={field.id}>
                {field.control === "checkbox" ? (
                  <input
                    className="input"
                    type="checkbox"
                    checked={value as boolean}
                    disabled={!enabled}
                    onChange={(event) => update(event.target.checked)}
                  />
                ) : (
                  field.label
                )}
                {field.control === "text" ? (
                  <div className="audio-discovery-field">
                    <input
                      className="input"
                      aria-invalid={!!errors[field.id]}
                      value={value as string}
                      disabled={!enabled}
                      onChange={(event) => update(event.target.value)}
                    />
                    {isDiscoveryField && isFound !== null ? (
                      <span
                        className={
                          isFound
                            ? "audio-discovery-status audio-discovery-status--found"
                            : "audio-discovery-status audio-discovery-status--missing"
                        }
                        aria-label={
                          isFound
                            ? "Matching audio file found"
                            : "No matching audio file found"
                        }
                        title={
                          isFound
                            ? "Matching audio file found"
                            : "No matching audio file found"
                        }
                      >
                        {isFound ? "\u2713" : "\u2717"}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {field.control === "number" ? (
                  <input
                    className="input"
                    type="number"
                    step="any"
                    aria-invalid={!!errors[field.id]}
                    value={value as number}
                    onChange={(event) => update(Number(event.target.value))}
                  />
                ) : null}
                {field.control === "select" ? (
                  <select
                    aria-invalid={!!errors[field.id]}
                    value={value as string}
                    disabled={!enabled}
                    onChange={(event) => update(event.target.value)}
                  >
                    {field.options?.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : null}
                {field.control === "checkbox" ? field.label : null}
                {errors[field.id] ? (
                  <span role="alert">{errors[field.id]}</span>
                ) : null}
              </label>
            );
          })}
          {selectedTab === "Audio" ? (
            <>
              <div
                className="audio-role-sources"
                aria-label="Multitrack WAV sources"
              >
                {AUDIO_ROLES.map((role) => {
                  const source = sources.get(role);
                  return (
                    <div className="audio-role-source" key={role}>
                      <strong>{role}</strong>
                      <span>{source?.fileName ?? "No file selected"}</span>
                      <input
                        type="file"
                        accept=".wav,audio/wav"
                        aria-label={`Choose ${role} WAV`}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = "";
                          if (!file) return;
                          const url = URL.createObjectURL(file);
                          const player = Audio({ file: url, preload: true });
                          setAudioSource(
                            {
                              role,
                              fileName: file.name,
                              url,
                              enabled: true,
                              volume: 1,
                            },
                            player,
                          );
                          syncPortableAudio(role, {
                            fileName: file.name,
                            enabled: true,
                            volume: 1,
                          });
                          markDirty();
                        }}
                      />
                      {source ? (
                        <>
                          <label>
                            <input
                              type="checkbox"
                              checked={source.enabled}
                              onChange={(event) => {
                                const enabled = event.target.checked;
                                setSourceEnabled(role, enabled);
                                syncPortableAudio(role, {
                                  fileName: source.fileName ?? "",
                                  enabled,
                                  volume: source.volume,
                                });
                                markDirty();
                              }}
                            />{" "}
                            Enabled
                          </label>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={source.volume}
                            aria-label={`${role} volume`}
                            onChange={(event) => {
                              const volume = Number(event.target.value);
                              setSourceVolume(role, volume);
                              syncPortableAudio(role, {
                                fileName: source.fileName ?? "",
                                enabled: source.enabled,
                                volume,
                              });
                              markDirty();
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              clearAudioSource(role);
                              syncPortableAudio(role, null);
                              markDirty();
                            }}
                          >
                            Clear
                          </button>
                        </>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <div className="audio-discovery-actions">
                {audioDirectorySupported ? (
                  <button
                    type="button"
                    onClick={() => {
                      void dispatch("select-audio-folder").then(
                        refreshAudioFileNames,
                      );
                    }}
                    disabled={!canExecute["select-audio-folder"]}
                  >
                    {audioDirectoryName
                      ? `Audio Folder: ${audioDirectoryName}`
                      : "Select Audio Folder"}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    refreshAudioFileNames();
                    void dispatch("refresh-audio");
                  }}
                  disabled={!canExecute["refresh-audio"]}
                >
                  Refresh Audio
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
      <div className="settings-actions">
        <button type="button" onClick={close}>
          Cancel
        </button>
        <button type="button" onClick={apply} disabled={!isDirty}>
          Apply
        </button>
        <button type="button" onClick={save} disabled={!isDirty}>
          Save
        </button>
      </div>
    </Modal>
  );
};

export { SettingsDialog };
