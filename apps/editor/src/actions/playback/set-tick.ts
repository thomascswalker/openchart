import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { PlaybackService } from "../../services/playback";

export class SetPlaybackTickAction extends Action<[number]> {
  constructor() {
    super({ condition: { "playback.can-play": true } });
  }

  run(accessor: ServicesAccessor, tick: number): void {
    accessor.get<PlaybackService>("playback").setPlaybackTick(tick);
  }
}
