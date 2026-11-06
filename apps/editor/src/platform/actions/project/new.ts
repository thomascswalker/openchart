import { Action } from '../../actions';
import { ProjectService } from '../../services/project/project';
import type { ServicesAccessor } from '../../services/registry';

export class NewProjectAction extends Action {
  run(accessor: ServicesAccessor): void {
    const project = accessor.get<ProjectService>('project');
    if (
      project.isDirty &&
      !window.confirm(
        'This project has unsaved changes. Discard them and continue?',
      )
    ) {
      return;
    }
    project.reset();
  }
}
