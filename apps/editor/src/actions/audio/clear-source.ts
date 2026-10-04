import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { AudioService, type AudioRole } from "../../services/audio";

export class ClearAudioSourceAction extends Action<[AudioRole]> {
  constructor() {
    super({});
  }

  run(accessor: ServicesAccessor, role: AudioRole): void {
    accessor.get<AudioService>("audio").clearAudioSource(role);
  }
}
