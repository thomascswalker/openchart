import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { AudioService, type AudioRole } from "../../services/audio";

export class SetAudioEnabledAction extends Action<[AudioRole, boolean]> {
  constructor() {
    super({});
  }

  run(accessor: ServicesAccessor, role: AudioRole, enabled: boolean): void {
    accessor.get<AudioService>("audio").setSourceEnabled(role, enabled);
  }
}
