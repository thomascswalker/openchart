import { Action } from '../../actions';
import { ProjectService } from '../../services/project/project';
import type { ServicesAccessor } from '../../services/registry';

export class MarkProjectDirtyAction extends Action {
  run(accessor: ServicesAccessor): void {
    accessor.get<ProjectService>('project').isDirty = true;
  }
}
