import { useState, type KeyboardEvent } from "react";
import { executeEditorAction, runAction } from "../../actions/execute";
import { useDocumentSnapshot } from "../../hooks/useDocumentSnapshot";
import type {
  ProjectMetadata,
  ProjectValidationIssue,
} from "../../project/projectMetadata";
import { Modal } from "../shared/Modal/Modal";
import { useRovingTabs } from "../../hooks/useRovingTabs";

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

/** Derives the editor from the archive-boundary shape: primitive root keys go
 * in General, while each root object becomes its own section. */
function getSections(metadata: ProjectMetadata): ProjectSection[] {
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
  issues: readonly ProjectValidationIssue[],
): Record<string, string> {
  return Object.fromEntries(issues.map((issue) => [issue.path, issue.message]));
}

function updatePrimitive(
  metadata: ProjectMetadata,
  section: string,
  key: string,
  value: Primitive,
): ProjectMetadata {
  const next = structuredClone(metadata) as Record<string, any>;
  if (section === "General") {
    next[key] = value;
  } else {
    (next[section] as Record<string, Primitive>)[key] = value;
  }
  return next as ProjectMetadata;
}

const ProjectDialog = () => {
  const { projectMetadata } = useDocumentSnapshot();
  const [draft, setDraft] = useState<ProjectMetadata>(projectMetadata);
  const [selectedSection, setSelectedSection] = useState("General");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const sections = getSections(draft);
  const selectedIndex = Math.max(
    0,
    sections.findIndex((section) => section.title === selectedSection),
  );
  const selected = sections[selectedIndex];
  const isDirty = JSON.stringify(draft) !== JSON.stringify(projectMetadata);

  const close = (): void => {
    runAction("dialog.close-project");
  };
  const selectSection = (title: string): void => {
    setSelectedSection(title);
    setErrors({});
  };
  const { tabRefs, onTabKeyDown } = useRovingTabs(sections.length, (index) =>
    selectSection(sections[index].title),
  );
  const apply = async (): Promise<boolean> => {
    const issues = await executeEditorAction<readonly ProjectValidationIssue[]>(
      "document.apply-project-metadata",
      draft,
    );
    setErrors(makeErrorMap(issues));
    return issues.length === 0;
  };
  const save = async (): Promise<void> => {
    if (await apply()) close();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };
  return (
    <Modal
      onKeyDown={onKeyDown}
      size={{ width: 760, height: 480, margin: 32 }}
      onBackdropClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <Modal.Header title="Project" onClick={close} />
      <div className="settings-body">
        <div
          className="settings-tabs"
          role="tablist"
          aria-label="Project sections"
          aria-orientation="vertical"
        >
          {sections.map((section, index) => (
            <button
              key={section.title}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              type="button"
              role="tab"
              id={`project-tab-${index}`}
              aria-selected={selected.title === section.title}
              aria-controls={`project-panel-${index}`}
              tabIndex={selected.title === section.title ? 0 : -1}
              onClick={() => selectSection(section.title)}
              onKeyDown={(event) => onTabKeyDown(event, index)}
            >
              {section.title}
            </button>
          ))}
        </div>
        <div
          className="settings-panel"
          role="tabpanel"
          id={`project-panel-${selectedIndex}`}
          aria-labelledby={`project-tab-${selectedIndex}`}
        >
          {selected.fields.map((field) => {
            const update = (value: Primitive): void =>
              setDraft(
                updatePrimitive(draft, selected.title, field.key, value),
              );
            return (
              <label key={field.path}>
                {field.value === true || field.value === false ? (
                  <input
                    className="input"
                    type="checkbox"
                    checked={field.value}
                    onChange={(event) => update(event.target.checked)}
                  />
                ) : (
                  field.key
                )}
                {typeof field.value === "string" ? (
                  <input
                    className="input"
                    aria-invalid={!!errors[field.path]}
                    value={field.value}
                    onChange={(event) => update(event.target.value)}
                  />
                ) : null}
                {typeof field.value === "number" ? (
                  <input
                    className="input"
                    type="number"
                    aria-invalid={!!errors[field.path]}
                    value={
                      Number.isFinite(field.value) ? String(field.value) : ""
                    }
                    onChange={(event) => update(Number(event.target.value))}
                  />
                ) : null}
                {field.value === null ? (
                  <select
                    aria-invalid={!!errors[field.path]}
                    value="null"
                    onChange={(event) =>
                      update(
                        event.target.value === "null"
                          ? null
                          : event.target.value,
                      )
                    }
                  >
                    <option value="null">null</option>
                  </select>
                ) : null}
                {field.value === true || field.value === false
                  ? field.key
                  : null}
                {errors[field.path] ? (
                  <span role="alert">{errors[field.path]}</span>
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

export { ProjectDialog, getSections };
