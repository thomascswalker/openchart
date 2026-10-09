import { useState } from "react";
import { executeEditorAction, runAction } from "../../actions/execute";
import { useApplicationSettings } from "../../hooks/useApplicationSettings";
import {
  type ApplicationSettings,
  validateApplicationSettings,
} from "../../services/settings";
import { Input } from "../shared/Input/Input";
import { Label, Text } from "../shared/Text";
import { Checkbox } from "../shared/Button";
import { Section } from "../shared/Section";
import { Dropdown } from "../shared/Dropdown";
import { BaseDialog } from "./BaseDialog";
import styles from "./SettingsDialog.module.css";

type SettingsControl = "text" | "number" | "checkbox" | "select";

interface SettingsField {
  id: string;
  label: string;
  control: SettingsControl;
  path: `${"saving" | "feedback" | "history" | "graphics"}.${string}`;
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
  Graphics: [
    {
      id: "antialiasing",
      label: "Antialiasing",
      control: "checkbox",
      path: "graphics.antialiasing",
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
      "saving" | "feedback" | "history" | "graphics"
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
      "saving" | "feedback" | "history" | "graphics"
    >,
    string,
  ];
  return {
    ...settings,
    [group]: { ...settings[group], [key]: value },
  } as ApplicationSettings;
}

const SettingsDialog = () => {
  const { settings } = useApplicationSettings();
  const [draft, setDraft] = useState<ApplicationSettings>(settings);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const close = (): void => {
    runAction("dialog.close-settings");
  };
  const apply = async (): Promise<boolean> => {
    const validationErrors = validateApplicationSettings(draft);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return false;
    return executeEditorAction("settings.apply", draft);
  };
  const isDirty = JSON.stringify(draft) !== JSON.stringify(settings);

  return (
    <BaseDialog
      title="Settings"
      options={tabs}
      optionsLabel="Settings sections"
      isDirty={isDirty}
      onApply={apply}
      onClose={close}
      onTabChange={() => setErrors({})}
      renderTab={(tab) => {
        const fields = settingsSchema[tab] ?? [];
        return fields.map((field) => {
          const value = getSettingValue(draft, field.path);
          const update = (nextValue: string | number | boolean): void => {
            setDraft(setSettingValue(draft, field.path, nextValue));
          };
          const inputId = `settings-field-${field.id}`;
          return (
            <Section className={styles.field} key={field.id}>
              {field.control === "checkbox" ? (
                <Checkbox
                  checked={value as boolean}
                  label={field.label}
                  onChange={(event) => update(event.target.checked)}
                />
              ) : (
                <Label htmlFor={inputId}>{field.label}</Label>
              )}
              {field.control === "text" ? (
                <Input
                  id={inputId}
                  className={styles.input}
                  aria-invalid={!!errors[field.id]}
                  value={value as string}
                  placeholder=""
                  onChange={(event) => update(event.target.value)}
                />
              ) : null}
              {field.control === "number" ? (
                <Input
                  id={inputId}
                  className={styles.input}
                  type="number"
                  min={field.min}
                  max={field.max}
                  step={field.step ?? "any"}
                  aria-invalid={!!errors[field.id]}
                  value={value as number}
                  placeholder=""
                  onChange={(event) => update(Number(event.target.value))}
                />
              ) : null}
              {field.control === "select" ? (
                <Dropdown
                  id={inputId}
                  className={styles.dropdown}
                  aria-invalid={!!errors[field.id]}
                  value={value as string}
                  options={
                    field.options?.map((option) => ({ ...option })) ?? []
                  }
                  onChange={(nextValue) => update(nextValue)}
                />
              ) : null}
              {errors[field.id] ? (
                <Text role="alert">{errors[field.id]}</Text>
              ) : null}
            </Section>
          );
        });
      }}
    />
  );
};

export { SettingsDialog };
