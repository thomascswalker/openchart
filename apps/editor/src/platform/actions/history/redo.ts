import { Action } from '../../actions';
import { ProjectService } from '../../services/project/project';
import type { ServicesAccessor } from '../../services/registry';

export class RedoAction extends Action {
  constructor() {
    super({ condition: { 'history.can-redo': true } });
  }

  run(accessor: ServicesAccessor) {
    accessor.get<ProjectService>('project').redoEdit();
  }
}
