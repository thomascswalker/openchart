import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { AudioService } from "../../services/audio";
import { SettingsService } from "../../services/settings";

export class RefreshAudioAction extends Action {
  constructor() {
    super({ condition: { "audio.single-track-mode": true } });
  }

  async run(accessor: ServicesAccessor): Promise<void> {
    const error = await accessor
      .get<AudioService>("audio")
      .discoverAudio(
        accessor.get<SettingsService>("settings").getSettings(),
        true,
      );
    if (error) throw new Error(error);
  }
}
