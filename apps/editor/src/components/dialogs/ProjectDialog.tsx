import { runActionAsync, runAction } from "../../actions/execute";
import { useDocumentSnapshot } from "../../hooks/useDocumentSnapshot";
import {
  MetadataSchema,
  type Metadata,
  type MetadataValidationErrors,
} from "../../services/document/schema";
import { Form } from "../shared/Form";

const ProjectDialog = () => {
  const { metadata, directoryHandle } = useDocumentSnapshot();

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
      schema={MetadataSchema}
      values={metadata}
      optionsLabel="Project sections"
      fileRootDirectory={directoryHandle}
      onApply={apply}
      onClose={close}
    />
  );
};

export { ProjectDialog };
