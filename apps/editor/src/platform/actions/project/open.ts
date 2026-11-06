import { Action } from '../../actions';
import {
  LoggerService,
  MixerService,
  ProjectService,
  type ServicesAccessor,
} from '../../services';
import { ApplyProjectMetadataAction } from './apply-project-metadata';

const ConfirmationMessage =
  'This project has unsaved changes. Discard them and continue?';

export class OpenProjectAction extends Action {
  async run(accessor: ServicesAccessor) {
    const logger = accessor.get<LoggerService>('logger');
    const project = accessor.get<ProjectService>('project');
    const mixer = accessor.get<MixerService>('mixer');

    const canContinue = !project.isDirty || window.confirm(ConfirmationMessage);
    if (!canContinue) {
      logger.error('Exiting file open');
      return;
    }

    try {
      const opened = await project.open();
      if (!opened) {
        return;
      }

      mixer.reset();
      const issues = await new ApplyProjectMetadataAction().run(
        accessor,
        project.metadata,
        true,
      );
      if (issues.length > 0) {
        throw new Error(
          issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n'),
        );
      }
      project.isDirty = false;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          logger.debug('Closed open file dialog');
          return;
        }
        logger.error(`An error occurred: ${error.message}`);
      }
      throw error;
    }
  }
}
