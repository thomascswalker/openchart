import { useState } from "react";
import { executeEditorAction, runAction } from "../../actions/execute";
import { useDocumentSnapshot } from "../../hooks/useDocumentSnapshot";
import type {
  Metadata,
  MetadataValidationIssue,
} from "../../services/document/schema";
import { Input } from "../shared/Input/Input";
import { Label, Text } from "../shared/Text";
import { Checkbox } from "../shared/Button";
import { Section } from "../shared/Section";
import { Dropdown } from "../shared/Dropdown";
import { BaseDialog } from "./BaseDialog";
import styles from "./ProjectDialog.module.css";

type Primitive = string | number | boolean | null;

interface ProjectField {
  key: string;
  path: string;
  value: Primitive;
}

interface ProjectSection {
  title: string;
  fields: ProjectField[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPrimitive(value: unknown): value is Primitive {
  return (
    value === null || ["string", "number", "boolean"].includes(typeof value)
  );
}

/** Shows primitive root fields in General and each nested metadata object as a section. */
function getSections(metadata: Metadata): ProjectSection[] {
  const general: ProjectField[] = [];
  const sections: ProjectSection[] = [];

  for (const [key, value] of Object.entries(metadata)) {
    if (isPrimitive(value)) {
      general.push({ key, path: `$.${key}`, value });
      continue;
    }
    if (!isRecord(value)) continue;
    const fields = Object.entries(value).reduce<ProjectField[]>(
      (result, [fieldKey, fieldValue]) => {
        if (isPrimitive(fieldValue)) {
          result.push({
            key: fieldKey,
            path: `$.${key}.${fieldKey}`,
            value: fieldValue,
          });
        }
        return result;
      },
      [],
    );
    sections.push({ title: key, fields });
  }

  return [{ title: "General", fields: general }, ...sections];
}

function makeErrorMap(
  issues: readonly MetadataValidationIssue[],
): Record<string, string> {
  return Object.fromEntries(issues.map((issue) => [issue.path, issue.message]));
}

function updatePrimitive(
  metadata: Metadata,
  section: string,
  key: string,
  value: Primitive,
): Metadata {
  const next = structuredClone(metadata) as unknown as Record<string, unknown>;
  if (section === "General") {
    next[key] = value;
  } else if (isRecord(next[section])) {
    next[section][key] = value;
  }
  return next as Metadata;
}

const ProjectDialog = () => {
  const { metadata } = useDocumentSnapshot();
  const [draft, setDraft] = useState<Metadata>(metadata);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const sections = getSections(draft);
  const isDirty = JSON.stringify(draft) !== JSON.stringify(metadata);

  const close = (): void => {
    runAction("dialog.close-project");
  };
  const apply = async (): Promise<boolean> => {
    const issues = await executeEditorAction<
      readonly MetadataValidationIssue[]
    >("document.apply-project-metadata", draft);
    setErrors(makeErrorMap(issues));
    return issues.length === 0;
  };
  return (
    <BaseDialog
      title="Project"
      options={sections.map((section) => section.title)}
      optionsLabel="Project sections"
      isDirty={isDirty}
      onApply={apply}
      onClose={close}
      onTabChange={() => setErrors({})}
      renderTab={(tab) => {
        const selected = sections.find((section) => section.title === tab);
        return selected?.fields.map((field) => {
          const inputId = `project-field-${field.path}`;
          const update = (value: Primitive): void =>
            setDraft(updatePrimitive(draft, selected.title, field.key, value));
          return (
            <Section className={styles.field} key={field.path}>
              {field.value === true || field.value === false ? (
                <Checkbox
                  checked={field.value}
                  label={field.key}
                  onChange={(event) => update(event.target.checked)}
                />
              ) : (
                <Label htmlFor={inputId}>{field.key}</Label>
              )}
              {typeof field.value === "string" ? (
                <Input
                  id={inputId}
                  className={styles.input}
                  aria-invalid={!!errors[field.path]}
                  value={field.value}
                  placeholder=""
                  onChange={(event) => update(event.target.value)}
                />
              ) : null}
              {typeof field.value === "number" ? (
                <Input
                  id={inputId}
                  className={styles.input}
                  type="number"
                  aria-invalid={!!errors[field.path]}
                  value={
                    Number.isFinite(field.value) ? String(field.value) : ""
                  }
                  placeholder=""
                  onChange={(event) => update(Number(event.target.value))}
                />
              ) : null}
              {field.value === null ? (
                <Dropdown
                  id={inputId}
                  className={styles.dropdown}
                  aria-invalid={!!errors[field.path]}
                  value="null"
                  options={[{ value: "null", label: "null" }]}
                  onChange={(nextValue) =>
                    update(nextValue === "null" ? null : nextValue)
                  }
                />
              ) : null}
              {errors[field.path] ? (
                <Text role="alert">{errors[field.path]}</Text>
              ) : null}
            </Section>
          );
        });
      }}
    />
  );
};

export { ProjectDialog };
