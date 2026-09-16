import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useEditorCommands } from "../commands/EditorCommand";
import {
  type ApplicationSettings,
  useApplicationSettings,
  validateApplicationSettings,
} from "../context/ApplicationSettingsContext";
import { Modal } from "./shared/Modal/Modal";

type SettingsTab = string;
type SettingsControl = "text" | "checkbox" | "select";

interface SettingsField {
  id: string;
  label: string;
  control: SettingsControl;
  path: `${"audio" | "discovery" | "saving"}.${string}`;
  options?: ReadonlyArray<{ label: string; value: string }>;
  enabledWhen?: (settings: ApplicationSettings) => boolean;
}

const audioDiscoveryFields: SettingsField[] = [
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
};

const tabs = Object.keys(settingsSchema);

function getSettingValue(
  settings: ApplicationSettings,
  path: SettingsField["path"],
): string | boolean {
  const [group, key] = path.split(".") as [
    keyof Pick<ApplicationSettings, "audio" | "discovery" | "saving">,
    string,
  ];
  return (settings[group] as Record<string, string | boolean>)[key];
}

function setSettingValue(
  settings: ApplicationSettings,
  path: SettingsField["path"],
  value: string | boolean,
): ApplicationSettings {
  const [group, key] = path.split(".") as [
    keyof Pick<ApplicationSettings, "audio" | "discovery" | "saving">,
    string,
  ];
  return {
    ...settings,
    [group]: { ...settings[group], [key]: value },
  } as ApplicationSettings;
}

const SettingsDialog = () => {
  const { dispatch } = useEditorCommands();
  const { settings, applySettings } = useApplicationSettings();
  const [selectedTab, setSelectedTab] = useState<SettingsTab>(tabs[0]);
  const [draft, setDraft] = useState<ApplicationSettings>(settings);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dialogRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

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
            const update = (nextValue: string | boolean): void =>
              setDraft(setSettingValue(draft, field.path, nextValue));
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
                  <input
                    className="input"
                    aria-invalid={!!errors[field.id]}
                    value={value as string}
                    disabled={!enabled}
                    onChange={(event) => update(event.target.value)}
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
