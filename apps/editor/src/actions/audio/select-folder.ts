import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { AudioService } from "../../services/audio";
import { SettingsService } from "../../services/settings";

export class SelectAudioFolderAction extends Action {
  constructor() {
    super({
      condition: {
        "audio.directory-picker-supported": true,
        "audio.single-track-mode": true,
      },
    });
  }

  run(accessor: ServicesAccessor): Promise<void> {
    return accessor
      .get<AudioService>("audio")
      .selectAudioFolder(
        accessor.get<SettingsService>("settings").getSettings(),
      );
  }
}
