import { Action } from "../../actions";
import type { ServicesAccessor } from "../../services";
import { PlaybackService } from "../../services/playback/playback";

export class PauseAction extends Action {
  constructor() {
    super({ condition: { "playback.is-playing": true } });
  }

  run(accessor: ServicesAccessor): void {
    const timeline = accessor.get<PlaybackService>("playback");
    timeline.pause();
  }
}
