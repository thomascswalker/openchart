import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import {
  ProjectValidationError,
  type ProjectValidationIssue,
  validateProjectMetadata,
} from "../../services/project/projectMetadata";
import { EditorStateService } from "../../services/editor/state";
import { DocumentService } from "../../services/document/document";

export class ApplyProjectMetadataAction extends Action<
  [unknown],
  readonly ProjectValidationIssue[]
> {
  constructor() {
    super({});
  }

  run(
    accessor: ServicesAccessor,
    metadata: unknown,
  ): readonly ProjectValidationIssue[] {
    const document = accessor.get<DocumentService>("document");
    try {
      document.setProjectMetadata(validateProjectMetadata(metadata));
      document.setDirty();
      accessor.get<EditorStateService>("editor.state").clearError();
      return [];
    } catch (error: unknown) {
      const issues =
        error instanceof ProjectValidationError
          ? error.issues
          : [
              {
                path: "$",
                message:
                  error instanceof Error && error.message
                    ? error.message
                    : "Project metadata is invalid.",
              },
            ];
      accessor
        .get<EditorStateService>("editor.state")
        .setError(
          issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"),
        );
      return issues;
    }
  }
}
