import { IStatefulService } from "../../platform/services";

export interface EditorStateSnapshot {
  error: string | null;
  debugVisible: boolean;
  projectVisible: boolean;
  settingsVisible: boolean;
}

export class EditorStateService extends IStatefulService<EditorStateSnapshot> {
  constructor() {
    super();
    this._snapshot = {
      error: null,
      debugVisible: false,
      projectVisible: false,
      settingsVisible: false,
    };
  }

  public readonly reset = (): void => {
    this._snapshot = {
      error: null,
      debugVisible: false,
      projectVisible: false,
      settingsVisible: false,
    };
    this.notify();
  };

  public readonly setError = (error: string | null): void => {
    if (this._snapshot.error === error) {
      return;
    }
    this.update({ error });
  };

  public readonly clearError = (): void => this.setError(null);

  public readonly setDebugVisible = (debugVisible: boolean): void => {
    if (this._snapshot.debugVisible === debugVisible) {
      return;
    }
    this.update({ debugVisible });
  };

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

  private update(change: Partial<EditorStateSnapshot>): void {
    this._snapshot = { ...this._snapshot, ...change };
    this.notify();
  }
}
