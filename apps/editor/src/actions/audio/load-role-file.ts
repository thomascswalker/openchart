import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { AudioService, type AudioRole } from "../../services/audio";

export class LoadAudioRoleFileAction extends Action<[AudioRole, File]> {
  constructor() {
    super({});
  }

  run(accessor: ServicesAccessor, role: AudioRole, file: File): Promise<void> {
    return accessor.get<AudioService>("audio").loadAudioSource(role, file);
  }
}
