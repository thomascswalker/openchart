import { Action } from "../../actions";
import type { ServicesAccessor } from "../../services";
import { PlaybackService } from "../../services/playback/playback";

export class SeekPlaybackStartAction extends Action {
  constructor() {
    super({ condition: { "playback.can-seek": true } });
  }

  run(accessor: ServicesAccessor): void {
    accessor.get<PlaybackService>("playback").seekStart();
  }
}
