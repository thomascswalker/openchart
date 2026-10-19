import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { PlaybackService } from "../../services/playback";

type Args = [number];
export class SetPlaybackTickAction extends Action<Args> {
  run(accessor: ServicesAccessor, tick: number): void {
    accessor.get<PlaybackService>("playback").setPlaybackTick(tick);
  }
}
