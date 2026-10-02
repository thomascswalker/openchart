import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import {
  AudioService,
  type AudioSourceState,
  type AudioPlayer,
} from "../../services/audio";

export class SetAudioSourceAction extends Action<
  [AudioSourceState, player?: AudioPlayer]
> {
  constructor() {
    super({});
  }

  run(
    accessor: ServicesAccessor,
    source: AudioSourceState,
    player?: AudioPlayer,
  ): void {
    accessor.get<AudioService>("audio").setAudioSource(source, player);
  }
}
