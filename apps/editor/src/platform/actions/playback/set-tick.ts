import { Action } from '../../actions';
import { PlaybackService } from '../../services/playback/playback';
import type { ServicesAccessor } from '../../services/registry';

type Args = [number];
export class SetPlaybackTickAction extends Action<Args> {
  run(accessor: ServicesAccessor, tick: number): void {
    accessor.get<PlaybackService>('playback').setPlaybackTick(tick);
  }
}
