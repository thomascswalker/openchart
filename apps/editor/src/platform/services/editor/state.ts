import type { Action } from '../../actions';
import { createDecorator } from '../service';
import { StatefulService } from '../statefulService';

export interface EditorStateSnapshot {
  error: string | null;
  projectVisible: boolean;
  settingsVisible: boolean;
  aboutVisible: boolean;
}

export class EditorStateService extends StatefulService<EditorStateSnapshot> {
  constructor() {
    super();
  }

  public static defaultSnapshot(): EditorStateSnapshot {
    return {
      error: null,
      projectVisible: false,
      settingsVisible: false,
      aboutVisible: false,
    };
  }

  public readonly reset = (): void => {
    this._snapshot = EditorStateService.defaultSnapshot();
    this.notify();
  };

  public readonly setError = (error: string | null): void => {
    if (this._snapshot.error === error) {
      return;
    }
    this.update({ error });
  };

  public readonly setErrorFromAction = (
    action: Action<any>,
    error: string | null,
  ) =>
    this.setError(
      `Failed to execute action ${action.options?.id || 'Unknown'}: ${error}`,
    );

  public readonly clearError = (): void => this.setError(null);

  public readonly setProjectVisible = (projectVisible: boolean): void => {
    if (this._snapshot.projectVisible === projectVisible) {
      return;
    }
    this.update({ projectVisible });
  };

  public readonly setSettingsVisible = (settingsVisible: boolean): void => {
    if (this._snapshot.settingsVisible === settingsVisible) {
      return;
    }
    this.update({ settingsVisible });
  };

  public readonly setAboutVisible = (aboutVisible: boolean): void => {
    if (this._snapshot.aboutVisible === aboutVisible) {
      return;
    }
    this.update({ aboutVisible });
  };

  private update(change: Partial<EditorStateSnapshot>): void {
    this._snapshot = { ...this._snapshot, ...change };
    this.notify();
  }
}

export type IEditorStateService = EditorStateService;
export const IEditorStateService =
  createDecorator<IEditorStateService>('editor.state');
