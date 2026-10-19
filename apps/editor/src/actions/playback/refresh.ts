import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { DocumentService } from "../../services/document";
import { PlaybackService } from "../../services/playback";

export class RefreshPlaybackAction extends Action {
  run(accessor: ServicesAccessor): void {
    const midiData = accessor.get<DocumentService>("document").data;
    accessor.get<PlaybackService>("playback").refresh(midiData);
  }
}
