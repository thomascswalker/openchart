import { runActionAsync, runAction } from "../../../actions/execute";
import { useDocument } from "../../../hooks/useDocument";
import {
  type Metadata,
  type MetadataValidationErrors,
} from "../../../services/document/schema";
import Platform from "../../../platform";
import type { DocumentService } from "../../../services/document";
import { Form } from "../../shared";

const ProjectDialog = () => {
  const { metadata, directoryHandle } = useDocument();
  // The schema follows the active ruleset (difficulty and settings fields).
  const documentService = Platform.services.get<DocumentService>("document");

  const close = (): void => {
    runAction("dialog.close-project");
  };

  const apply = async (values: Metadata): Promise<boolean> => {
    const errors = await runActionAsync<MetadataValidationErrors>(
      "document.apply-project-metadata",
      values,
    );
    return errors.length === 0;
  };

  return (
    <Form
      title="Project"
      schema={documentService.metadataSchema}
      values={metadata}
      optionsLabel="Project sections"
      fileRootDirectory={directoryHandle}
      onApply={apply}
      onClose={close}
    />
  );
};

export { ProjectDialog };
