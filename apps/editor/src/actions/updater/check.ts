import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { UpdaterService } from "../../services/updater";

export class CheckForUpdatesAction extends Action {
  constructor() {
    super({ condition: { "platform.is-tauri": true } });
  }

  async run(accessor: ServicesAccessor): Promise<void> {
    await accessor.get<UpdaterService>("updater").check();
  }
}
