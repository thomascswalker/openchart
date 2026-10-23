import { runActionAsync, runAction } from "../../../actions/execute";
import { useDocument } from "../../../hooks/useDocument";
import {
  MetadataSchema,
  type Metadata,
  type MetadataValidationErrors,
} from "../../../services/document/schema";
import { Form } from "../../shared";

const ProjectDialog = () => {
  const { metadata, directoryHandle } = useDocument();

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
