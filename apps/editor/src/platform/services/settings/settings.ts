import { createDecorator } from '../service';
import { StatefulService } from '../statefulService';
import { IWorkspaceService } from '../workspace';
import {
  type ApplicationSettingGroup,
  type ApplicationSettingPath,
  type ApplicationSettingValue,
  type ApplicationSettings,
  ApplicationSettingsSchema,
  DefaultApplicationSettings,
  StorageKey,
} from './schema';

export class SettingsService extends StatefulService<ApplicationSettings> {
  constructor(@IWorkspaceService private workspaceService: IWorkspaceService) {
    super();
  }

  defaultSnapshot(): ApplicationSettings {
    return DefaultApplicationSettings;
  }

  public init(): void {
    this._snapshot = this.read();
  }

  public readonly reset = (): void => {
    window.localStorage.setItem(
      StorageKey,
      JSON.stringify(DefaultApplicationSettings),
    );
    this._snapshot = this.defaultSnapshot();
    this.workspaceService.reset();
    this.notify();
  };

  public readonly getSettings = (): ApplicationSettings => this._snapshot;

  /**
   * Reads the application settings from local storage.
   *
   * If no settings are found or the stored settings are invalid,
   * the default settings are returned.
   */
  private readonly read = (): ApplicationSettings => {
    if (typeof window === 'undefined') {
      return DefaultApplicationSettings;
    }

    // Read the settings from local storage
    const stored = window.localStorage.getItem(StorageKey);

    // If there are no stored settings, return the default settings
    if (!stored) {
      return DefaultApplicationSettings;
    }

    // Parse and validate the stored settings against the schema
    const parseResult = ApplicationSettingsSchema.safeParse(JSON.parse(stored));

    // If the parse was successful, merge the parsed data with the default
    // settings
    if (parseResult.success) {
      return {
        ...DefaultApplicationSettings,
        ...parseResult.data,
      };
    }

    // Otherwise, return the default settings
    return DefaultApplicationSettings;
  };

  public readonly load = (): void => {
    this._snapshot = this.read();
    this.notify();
  };

  public readonly validate = (settings: ApplicationSettings): boolean => {
    return ApplicationSettingsSchema.safeParse(settings).success;
  };

  public readonly applySettings = (settings: ApplicationSettings): boolean => {
    if (!this.validate(settings)) {
      return false;
    }

    if (
      settings.workspace.uri !== null &&
      settings.workspace.uri !== this._snapshot.workspace.uri
    ) {
      // Set workspace directory handle from the updated setting
      // this.workspace.setHandle(settings.workspace.uri);
    }

    window.localStorage.setItem(StorageKey, JSON.stringify(settings));
    this._snapshot = settings;
    this.notify();
    return true;
  };

  public readonly apply = <Path extends ApplicationSettingPath>(
    path: Path,
    value: ApplicationSettingValue<Path>,
  ): boolean => {
    const [group, key] = path.split('.') as [ApplicationSettingGroup, string];
    const settings = {
      ...this._snapshot,
      [group]: { ...this._snapshot[group], [key]: value },
    } as ApplicationSettings;
    return this.applySettings(settings);
  };
}

export type ISettingsService = SettingsService;
export const ISettingsService = createDecorator<ISettingsService>('settings');
