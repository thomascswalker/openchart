import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { TimelineService } from "../../services/timeline";

export class SeekPlaybackStartAction extends Action {
  constructor() {
    super({ condition: { "playback.can-seek": true } });
  }

  run(accessor: ServicesAccessor): void {
    accessor.get<TimelineService>("timeline").seekStart();
  }
}
