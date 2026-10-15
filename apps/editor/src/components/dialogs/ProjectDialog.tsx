import { executeEditorAction, runAction } from "../../actions/execute";
import { useDocumentSnapshot } from "../../hooks/useDocumentSnapshot";
import {
  metadataSchema,
  type Metadata,
  type MetadataValidationIssue,
} from "../../services/document/schema";
import { Form } from "../shared/Form";

const ProjectDialog = () => {
  const { metadata } = useDocumentSnapshot();

  const close = (): void => {
    runAction("dialog.close-project");
  };

  const apply = async (values: Metadata): Promise<boolean> => {
    const issues = await executeEditorAction<
      readonly MetadataValidationIssue[]
    >("document.apply-project-metadata", values);
    return issues.length === 0;
  };

  return (
    <Form
      title="Project"
      schema={metadataSchema}
      values={metadata}
      optionsLabel="Project sections"
      onApply={apply}
      onClose={close}
    />
  );
};

export { ProjectDialog };
