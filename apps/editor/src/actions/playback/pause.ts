import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { TimelineService } from "../../services/timeline";

export class PauseAction extends Action {
  constructor() {
    super({ condition: { "playback.is-playing": true } });
  }

  run(accessor: ServicesAccessor): void {
    const timeline = accessor.get<TimelineService>("timeline");
    timeline.pause();
  }
}
