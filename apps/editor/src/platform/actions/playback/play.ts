import { Action } from '../../actions';
import { PlaybackService } from '../../services/playback/playback';
import type { ServicesAccessor } from '../../services/registry';

export class PlayAction extends Action {
  run(accessor: ServicesAccessor): void {
    accessor.get<PlaybackService>('playback').play();
  }
}
