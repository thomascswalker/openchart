import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { PlaybackService } from "../../services/playback";

export class SeekPlaybackEndAction extends Action {
  constructor() {
    super({ condition: { "playback.can-seek": true } });
  }

  run(accessor: ServicesAccessor): void {
    accessor.get<PlaybackService>("playback").seekEnd();
  }
}
