import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { AudioService, type AudioRole } from "../../services/audio";

export class SetAudioVolumeAction extends Action<[AudioRole, number]> {
  constructor() {
    super({});
  }

  run(accessor: ServicesAccessor, role: AudioRole, volume: number): void {
    accessor.get<AudioService>("audio").setSourceVolume(role, volume);
  }
}
