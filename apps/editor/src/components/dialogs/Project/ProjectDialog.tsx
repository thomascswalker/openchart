import { useProject } from '../../../hooks/useProject';
import Platform from '../../../platform';
import { runAction, runActionAsync } from '../../../platform/actions/execute';
import type { ProjectService } from '../../../platform/services/project/project';
import {
  type Metadata,
  type MetadataValidationErrors,
} from '../../../platform/services/project/schema';
import { Form } from '../../shared';

const ProjectDialog = () => {
  const { metadata, directoryHandle } = useProject();
  // The schema follows the active ruleset (difficulty and settings fields).
  const projectService = Platform.services.get<ProjectService>('project');

  const close = (): void => {
    runAction('dialog.close-project');
  };

  const apply = async (values: Metadata): Promise<boolean> => {
    const errors = await runActionAsync<MetadataValidationErrors>(
      'project.apply-project-metadata',
      values,
    );
    return errors.length === 0;
  };

  return (
    <Form
      title="Project"
      schema={projectService.metadataSchema}
      values={metadata}
      optionsLabel="Project sections"
      fileRootDirectory={directoryHandle}
      onApply={apply}
      onClose={close}
    />
  );
};

export { ProjectDialog };
