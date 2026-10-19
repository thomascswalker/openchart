import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { PlaybackService } from "../../services/playback";

export class TogglePlaybackAction extends Action {
  run(accessor: ServicesAccessor): void {
    accessor.get<PlaybackService>("playback").togglePlay();
  }
}
