import { Action } from "../../actions";
import type { ServicesAccessor } from "../../services";
import { PlaybackService } from "../../services/playback/playback";

type Args = [number];
export class SetPlaybackTickAction extends Action<Args> {
  run(accessor: ServicesAccessor, tick: number): void {
    accessor.get<PlaybackService>("playback").setPlaybackTick(tick);
  }
}
