import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { AudioService } from "../../services/audio";

export class LoadAudioFileAction extends Action<[File]> {
  constructor() {
    super({});
  }

  run(accessor: ServicesAccessor, file: File): Promise<void> {
    return accessor.get<AudioService>("audio").loadAudioFile(file);
  }
}
