import { Action } from '../../actions';
import type { ServicesAccessor } from '../../services/registry';
import { UpdaterService } from '../../services/updater/updater';

export class CheckForUpdatesAction extends Action {
  constructor() {
    super({ condition: { 'platform.is-tauri': true } });
  }

  async run(accessor: ServicesAccessor) {
    await accessor.get<UpdaterService>('updater').check();
  }
}
