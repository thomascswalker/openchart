import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { AudioService } from "../../services/audio";

export class OpenAudioAction extends Action {
  constructor() {
    super({});
  }

  run(accessor: ServicesAccessor): Promise<void> {
    return accessor.get<AudioService>("audio").openAudio();
  }
}
