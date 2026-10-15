import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { EditorStateService } from "../../services/editor/state";
import { DocumentService } from "../../services/document";
import {
  metadataSchema,
  type MetadataValidationError,
} from "../../services/document/schema";

export class ApplyProjectMetadataAction extends Action<
  [unknown],
  readonly MetadataValidationError[]
> {
  constructor() {
    super({});
  }

  run(
    accessor: ServicesAccessor,
    metadata: unknown,
  ): readonly MetadataValidationError[] {
    const document = accessor.get<DocumentService>("document");
    const result = metadataSchema.safeParse(metadata);
    if (result.success) {
      document.metadata = result.data;
      accessor.get<EditorStateService>("editor.state").clearError();
      return [];
    }

    const issues = result.error.issues.map((issue) => ({
      path: issue.path.length > 0 ? `$.${issue.path.join(".")}` : "$",
      message: issue.message,
    }));
    accessor
      .get<EditorStateService>("editor.state")
      .setError(
        issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"),
      );
    return issues;
  }
}
