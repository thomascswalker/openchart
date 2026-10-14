import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { DocumentService } from "../../services/document/document";
import { PlaybackService } from "../../services/playback";

export class RefreshPlaybackAction extends Action {
  constructor() {
    super({});
  }

  run(accessor: ServicesAccessor): void {
    const midiData = accessor.get<DocumentService>("document").getData();
    accessor.get<PlaybackService>("playback").refresh(midiData);
  }
}
