import { Action } from '../../actions';
import type { ServicesAccessor } from '../../services/registry';
import type { ApplicationSettings } from '../../services/settings/schema';
import { SettingsService } from '../../services/settings/settings';

export class ApplySettingsAction extends Action<
  [ApplicationSettings],
  boolean
> {
  run(accessor: ServicesAccessor, settings: ApplicationSettings): boolean {
    return accessor.get<SettingsService>('settings').applySettings(settings);
  }
}
