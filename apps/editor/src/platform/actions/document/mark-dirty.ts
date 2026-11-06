import { Action } from '../../actions';
import { DocumentService } from '../../services/document/document';
import type { ServicesAccessor } from '../../services/registry';

export class MarkDocumentDirtyAction extends Action {
  run(accessor: ServicesAccessor): void {
    accessor.get<DocumentService>('document').isDirty = true;
  }
}
