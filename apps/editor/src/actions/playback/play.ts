import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { PlaybackService } from "../../services/playback";

export class PlayAction extends Action {
  constructor() {
    super({ condition: { "playback.can-play": true } });
  }

  run(accessor: ServicesAccessor): void {
    accessor.get<PlaybackService>("playback").play();
  }
}
