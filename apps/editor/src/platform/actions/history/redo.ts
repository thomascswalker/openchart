import { Action } from '../../actions';
import { DocumentService } from '../../services/document/document';
import type { ServicesAccessor } from '../../services/registry';

export class RedoAction extends Action {
  constructor() {
    super({ condition: { 'history.can-redo': true } });
  }

  run(accessor: ServicesAccessor): void {
    accessor.get<DocumentService>('document').redoEdit();
  }
}
