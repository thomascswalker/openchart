import { Action } from '../../actions';
import { DocumentService } from '../../services/document/document';
import type { ServicesAccessor } from '../../services/registry';

export class UndoAction extends Action {
  constructor() {
    super({ condition: { 'history.can-undo': true } });
  }

  run(accessor: ServicesAccessor): void {
    accessor.get<DocumentService>('document').undoEdit();
  }
}
