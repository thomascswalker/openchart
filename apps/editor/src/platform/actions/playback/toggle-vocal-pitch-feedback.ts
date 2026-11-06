import { Action } from '../../actions';
import { PlaybackService } from '../../services/playback/playback';
import type { ServicesAccessor } from '../../services/registry';

export class ToggleVocalPitchFeedbackAction extends Action {
  run(accessor: ServicesAccessor): void {
    accessor.get<PlaybackService>('playback').toggleVocalPitchFeedback();
  }
}
