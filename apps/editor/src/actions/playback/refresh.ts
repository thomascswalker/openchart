import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { TimelineService } from "../../services/timeline";

export class RefreshPlaybackAction extends Action {
  constructor() {
    super({});
  }

  run(accessor: ServicesAccessor): void {
    accessor.get<TimelineService>("timeline").refresh();
  }
}
