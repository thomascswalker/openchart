import { Action } from '../../actions';
import type { ServicesAccessor } from '../../services/registry';
import type { ApplicationSettings } from '../../services/settings/schema';
import { SettingsService } from '../../services/settings/settings';

type TArgs = [ApplicationSettings];
type TResult = boolean;
export class ApplySettingsAction extends Action<TArgs, TResult> {
  run(accessor: ServicesAccessor, settings: ApplicationSettings) {
    return accessor.get<SettingsService>('settings').applySettings(settings);
  }
}
