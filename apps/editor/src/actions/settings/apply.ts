import type { ApplicationSettings } from "../../services/settings/schema";
import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { SettingsService } from "../../services/settings";

export class ApplySettingsAction extends Action<
  [ApplicationSettings],
  boolean
> {
  run(accessor: ServicesAccessor, settings: ApplicationSettings): boolean {
    return accessor.get<SettingsService>("settings").applySettings(settings);
  }
}
