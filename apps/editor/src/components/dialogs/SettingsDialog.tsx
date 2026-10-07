import { useRef, useState, type KeyboardEvent } from "react";
import { executeEditorAction, runAction } from "../../actions/execute";
import { useApplicationSettings } from "../../hooks/useApplicationSettings";
import {
  type ApplicationSettings,
  validateApplicationSettings,
} from "../../services/settings";
import { useRovingTabs } from "../../hooks/useRovingTabs";
import { Modal } from "../shared/Modal/Modal";

type SettingsTab = string;
type SettingsControl = "text" | "number" | "checkbox" | "select";

interface SettingsField {
  id: string;
  label: string;
  control: SettingsControl;
  path: `${"saving" | "feedback" | "history"}.${string}`;
  options?: ReadonlyArray<{ label: string; value: string }>;
  min?: number;
  max?: number;
  step?: number;
}

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
    {
      id: "historyCapacity",
      label: "History capacity",
      control: "number",
      path: "history.capacity",
      min: 1,
      max: 1024,
      step: 1,
    },
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
    keyof Pick<ApplicationSettings, "saving" | "feedback" | "history">,
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
    keyof Pick<ApplicationSettings, "saving" | "feedback" | "history">,
    string,
  ];
  return {
    ...settings,
    [group]: { ...settings[group], [key]: value },
  } as ApplicationSettings;
}

const SettingsDialog = () => {
  const { settings } = useApplicationSettings();
  const [selectedTab, setSelectedTab] = useState<SettingsTab>(tabs[0]);
  const [draft, setDraft] = useState<ApplicationSettings>(settings);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dialogRef = useRef<HTMLDivElement>(null);

  const close = (): void => {
    runAction("dialog.close-settings");
  };
  const selectTab = (tab: SettingsTab): void => {
    setSelectedTab(tab);
    setErrors({});
  };
  const { tabRefs, onTabKeyDown } = useRovingTabs(tabs.length, (index) =>
    selectTab(tabs[index]),
  );
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
  const apply = async (): Promise<boolean> => {
    const validationErrors = validateApplicationSettings(draft);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return false;
    return executeEditorAction("settings.apply", draft);
  };
  const save = async (): Promise<void> => {
    if (await apply()) close();
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
            const update = (nextValue: string | number | boolean): void => {
              setDraft(setSettingValue(draft, field.path, nextValue));
            };
            return (
              <label key={field.id}>
                {field.control === "checkbox" ? (
                  <input
                    className="input"
                    type="checkbox"
                    checked={value as boolean}
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
                    onChange={(event) => update(event.target.value)}
                  />
                ) : null}
                {field.control === "number" ? (
                  <input
                    className="input"
                    type="number"
                    min={field.min}
                    max={field.max}
                    step={field.step ?? "any"}
                    aria-invalid={!!errors[field.id]}
                    value={value as number}
                    onChange={(event) => update(Number(event.target.value))}
                  />
                ) : null}
                {field.control === "select" ? (
                  <select
                    aria-invalid={!!errors[field.id]}
                    value={value as string}
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
