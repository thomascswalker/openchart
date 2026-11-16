import { Action } from '../../actions';
import { PlaybackService } from '../../services/playback/playback';
import type { ServicesAccessor } from '../../services/registry';

export class SeekPlaybackStartAction extends Action {
  constructor() {
    super({ condition: { 'playback.can-seek': true } });
  }

  run(accessor: ServicesAccessor): void {
    accessor.get<PlaybackService>('playback').seekStart();
  }
}
