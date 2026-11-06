import { Action } from "../../actions";
import type { ServicesAccessor } from "../../services";
import { PlaybackService } from "../../services/playback/playback";

export class PlayAction extends Action {
  run(accessor: ServicesAccessor): void {
    accessor.get<PlaybackService>("playback").play();
  }
}
