import { Action } from '../../actions';
import { DocumentService } from '../../services/document/document';
import { PlaybackService } from '../../services/playback/playback';
import type { ServicesAccessor } from '../../services/registry';

export class RefreshPlaybackAction extends Action {
  run(accessor: ServicesAccessor): void {
    const midiData = accessor.get<DocumentService>('document').data;
    accessor.get<PlaybackService>('playback').refresh(midiData);
  }
}
