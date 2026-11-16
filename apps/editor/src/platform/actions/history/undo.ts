import { Action } from '../../actions';
import { ProjectService } from '../../services/project/project';
import type { ServicesAccessor } from '../../services/registry';

export class UndoAction extends Action {
  constructor() {
    super({ condition: { 'history.can-undo': true } });
  }

  run(accessor: ServicesAccessor) {
    accessor.get<ProjectService>('project').undoEdit();
  }
}
