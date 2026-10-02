import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { TimelineService } from "../../services/timeline";

export class PlayAction extends Action {
  constructor() {
    super({ condition: { "playback.can-play": true } });
  }

  run(accessor: ServicesAccessor): void {
    accessor.get<TimelineService>("timeline").play();
  }
}
