import { Action } from '../../actions';
import { PlaybackService } from '../../services/playback/playback';
import { ProjectService } from '../../services/project/project';
import type { ServicesAccessor } from '../../services/registry';

export class RefreshPlaybackAction extends Action {
  run(accessor: ServicesAccessor): void {
    const midiData = accessor.get<ProjectService>('project').data;
    accessor.get<PlaybackService>('playback').refresh(midiData);
  }
}
