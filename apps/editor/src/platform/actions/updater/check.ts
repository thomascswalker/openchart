import { Action } from "../../actions";
import type { ServicesAccessor } from "../../services";
import { UpdaterService } from "../../services/updater/updater";

export class CheckForUpdatesAction extends Action {
  constructor() {
    super({ condition: { "platform.is-tauri": true } });
  }

  async run(accessor: ServicesAccessor): Promise<void> {
    await accessor.get<UpdaterService>("updater").check();
  }
}
