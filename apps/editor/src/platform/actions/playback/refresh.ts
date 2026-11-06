import { Action } from "../../actions";
import type { ServicesAccessor } from "../../services";
import { DocumentService } from "../../services/document/document";
import { PlaybackService } from "../../services/playback/playback";

export class RefreshPlaybackAction extends Action {
  run(accessor: ServicesAccessor): void {
    const midiData = accessor.get<DocumentService>("document").data;
    accessor.get<PlaybackService>("playback").refresh(midiData);
  }
}
