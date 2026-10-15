import { useRef, useState, type KeyboardEvent } from "react";
import { useForm } from "@tanstack/react-form";
import z from "zod";
import { Button, Checkbox } from "../Button";
import { Dropdown } from "../Dropdown";
import { FileInput, Input } from "../Input/Input";
import { Section } from "../Section";
import { Label, Text } from "../Text";
import { Modal } from "../Modal/Modal";
import { ListView } from "../ListView";
import styles from "./form.module.css";
import { startCase } from "es-toolkit";

type FieldPath<T> = {
  [K in keyof T & string]: T[K] extends object ? `${K}.${FieldPath<T[K]>}` : K;
}[keyof T & string];

interface FieldMetadata {
  label?: string;
  hidden?: boolean;
  file?: boolean;
  types?: FilePickerAcceptType[];
  tab?: string;
  min?: number;
  max?: number;
  step?: number;
}

interface DialogField {
  key: string;
  name: string;
  schema: z.ZodType;
  metadata: FieldMetadata;
}

interface DialogTab {
  title: string;
  fields: DialogField[];
}

interface FormProps<T extends object> {
  title: string;
  schema: z.ZodType<T, T>;
  values: T;
  optionsLabel: string;
  onApply: (values: T) => Promise<boolean>;
  onClose: () => void;
}

function fieldMetadata(schema: z.ZodType): FieldMetadata {
  return (schema.meta() ?? {}) as FieldMetadata;
}

function getTabs(schema: z.ZodType): DialogTab[] {
  if (!(schema instanceof z.ZodObject)) return [];

  const tabs = new Map<string, DialogField[]>([["General", []]]);
  for (const [key, fieldSchema] of Object.entries(schema.shape)) {
    if (fieldSchema instanceof z.ZodObject) {
      const title = fieldMetadata(fieldSchema).tab ?? key;
      const fields = tabs.get(title) ?? [];
      for (const [fieldKey, nestedSchema] of Object.entries(
        fieldSchema.shape,
      )) {
        const metadata = fieldMetadata(nestedSchema);
        if (!metadata.hidden) {
          fields.push({
            key: fieldKey,
            name: `${key}.${fieldKey}`,
            schema: nestedSchema,
            metadata,
          });
        }
      }
      tabs.set(title, fields);
    } else {
      const metadata = fieldMetadata(fieldSchema);
      if (!metadata.hidden) {
        const title = metadata.tab ?? "General";
        const fields = tabs.get(title) ?? [];
        fields.push({ key, name: key, schema: fieldSchema, metadata });
        tabs.set(title, fields);
      }
    }
  }

  return [...tabs]
    .filter(([, fields]) => fields.length > 0)
    .map(([title, fields]) => ({ title, fields }));
}

const Form = <T extends object>({
  title,
  schema,
  values,
  optionsLabel,
  onApply,
  onClose,
}: FormProps<T>) => {
  const submitSucceeded = useRef(false);
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({});
  const tabs = getTabs(schema);
  const options = tabs.map((tab) => startCase(tab.title));
  const [selectedTab, setSelectedTab] = useState(options[0] ?? "");
  const dialogRef = useRef<HTMLDivElement>(null);
  const selectedIndex = Math.max(0, options.indexOf(selectedTab));
  const form = useForm({
    defaultValues: values,
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      submitSucceeded.current = await onApply(value);
      if (submitSucceeded.current) form.reset(value);
    },
  });

  const selectTab = (tab: string): void => {
    setSelectedTab(tab);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [
      ...(dialogRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), select:not([disabled])",
      ) ?? []),
    ];
    if (focusable.length === 0) return;
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
    submitSucceeded.current = false;
    const result = schema.safeParse(form.state.values);
    if (!result.success) {
      setValidationErrors(
        Object.fromEntries(
          result.error.issues.map((issue) => [
            issue.path.join("."),
            issue.message,
          ]),
        ),
      );
    } else {
      setValidationErrors({});
    }
    await form.handleSubmit();
    return submitSucceeded.current;
  };

  return (
    <form.Subscribe selector={(state) => state.isDirty}>
      {(isDirty) => (
        <Modal
          dialogRef={dialogRef}
          onKeyDown={onKeyDown}
          className={styles.form}
          size={{ width: 760, height: 480, margin: 32 }}
          onBackdropClick={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <Modal.Header title={title} onClick={onClose} />
          <Section className={styles.body}>
            <ListView
              id="dialog-sections"
              className={styles.navigation}
              options={options}
              value={selectedTab}
              ariaLabel={optionsLabel}
              onChange={selectTab}
            />
            <Section
              className={styles.panel}
              role="region"
              id="dialog-panel"
              aria-labelledby={`dialog-sections-option-${selectedIndex}`}
            >
              {tabs[selectedIndex]?.fields.map((field) => {
                const inputId = `dialog-field-${field.name}`;

                return (
                  <form.Field
                    key={field.name}
                    name={field.name as FieldPath<T>}
                  >
                    {(fieldApi) => {
                      const value = fieldApi.state.value;
                      const error =
                        validationErrors[field.name] ??
                        (fieldApi.state.meta.errors[0]
                          ? String(fieldApi.state.meta.errors[0])
                          : undefined);
                      const label = field.metadata.label ?? field.key;

                      return (
                        <Section className={styles.field}>
                          {typeof value === "boolean" ? (
                            <Checkbox
                              checked={value}
                              label={label}
                              aria-invalid={!!error}
                              onChange={(event) => {
                                fieldApi.handleChange(
                                  event.target.checked as typeof value,
                                );
                                setValidationErrors({});
                              }}
                            />
                          ) : (
                            <>
                              <Label htmlFor={inputId}>
                                {startCase(label)}
                              </Label>
                              {field.metadata.file ? (
                                <FileInput
                                  id={inputId}
                                  className={styles.input}
                                  aria-invalid={!!error}
                                  value={typeof value === "string" ? value : ""}
                                  placeholder=""
                                  types={field.metadata.types || []}
                                  onFileChange={(file) => {
                                    fieldApi.handleChange(
                                      (file?.name ?? null) as typeof value,
                                    );
                                    setValidationErrors({});
                                  }}
                                />
                              ) : field.schema instanceof z.ZodEnum ? (
                                <Dropdown
                                  id={inputId}
                                  className={styles.dropdown}
                                  aria-invalid={!!error}
                                  value={String(value)}
                                  options={field.schema.options.map(
                                    (option) => {
                                      const value = String(option);
                                      return { value, label: value };
                                    },
                                  )}
                                  onChange={(nextValue) => {
                                    fieldApi.handleChange(
                                      nextValue as typeof value,
                                    );
                                    setValidationErrors({});
                                  }}
                                />
                              ) : (
                                <Input
                                  id={inputId}
                                  className={styles.input}
                                  type={
                                    typeof value === "number"
                                      ? "number"
                                      : "text"
                                  }
                                  min={field.metadata.min}
                                  max={field.metadata.max}
                                  step={field.metadata.step ?? "any"}
                                  aria-invalid={!!error}
                                  value={
                                    typeof value === "number"
                                      ? value
                                      : String(value)
                                  }
                                  placeholder=""
                                  onChange={(event) => {
                                    fieldApi.handleChange(
                                      (typeof value === "number"
                                        ? Number(event.target.value)
                                        : event.target.value) as typeof value,
                                    );
                                    setValidationErrors({});
                                  }}
                                />
                              )}
                            </>
                          )}
                          {error ? <Text role="alert">{error}</Text> : null}
                        </Section>
                      );
                    }}
                  </form.Field>
                );
              })}
            </Section>
          </Section>
          <Section
            className={styles.actions}
            flexDirection="row"
            alignItems="center"
            justifyContent="flex-end"
          >
            <Button onClick={onClose}>Cancel</Button>
            <Button onClick={apply} disabled={!isDirty}>
              Apply
            </Button>
            <Button
              onClick={async () => {
                if (await apply()) onClose();
              }}
              disabled={!isDirty}
            >
              OK
            </Button>
          </Section>
        </Modal>
      )}
    </form.Subscribe>
  );
};

export { Form };
export type { FormProps };
