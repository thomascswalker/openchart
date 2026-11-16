import { Action } from '../../actions';
import { PlaybackService } from '../../services/playback/playback';
import type { ServicesAccessor } from '../../services/registry';

export class PauseAction extends Action {
  constructor() {
    super({ condition: { 'playback.is-playing': true } });
  }

  run(accessor: ServicesAccessor): void {
    const timeline = accessor.get<PlaybackService>('playback');
    timeline.pause();
  }
}
