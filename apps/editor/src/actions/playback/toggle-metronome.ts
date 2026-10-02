import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { PlaybackFeedbackService } from "../../services/playback/feedback";

export class ToggleMetronomeAction extends Action {
  constructor() {
    super({});
  }

  run(accessor: ServicesAccessor): void {
    accessor
      .get<PlaybackFeedbackService>("playback.feedback")
      .toggleMetronome();
  }
}
