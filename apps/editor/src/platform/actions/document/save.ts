import { Action } from '../../actions';
import { DocumentService } from '../../services/document/document';
import type { ServicesAccessor } from '../../services/registry';

export class SaveDocumentAction extends Action {
  constructor() {
    super({ condition: { 'document.has-tracks': true } });
  }

  async run(accessor: ServicesAccessor): Promise<void> {
    const document = accessor.get<DocumentService>('document');
    await document.save();
  }
}
