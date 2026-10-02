export interface EditorStateSnapshot {
  error: string | null;
  debugVisible: boolean;
  projectVisible: boolean;
  settingsVisible: boolean;
}

export class EditorStateService {
  private listeners = new Set<() => void>();
  private snapshot: EditorStateSnapshot = {
    error: null,
    debugVisible: false,
    projectVisible: false,
    settingsVisible: false,
  };

  public readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  public readonly getSnapshot = (): EditorStateSnapshot => this.snapshot;

  public readonly reset = (): void => {
    this.snapshot = {
      error: null,
      debugVisible: false,
      projectVisible: false,
      settingsVisible: false,
    };
    for (const listener of this.listeners) listener();
  };

  public readonly setError = (error: string | null): void => {
    if (this.snapshot.error === error) return;
    this.update({ error });
  };

  public readonly clearError = (): void => this.setError(null);

  public readonly setDebugVisible = (debugVisible: boolean): void => {
    if (this.snapshot.debugVisible === debugVisible) return;
    this.update({ debugVisible });
  };

  public readonly setProjectVisible = (projectVisible: boolean): void => {
    if (this.snapshot.projectVisible === projectVisible) return;
    this.update({ projectVisible });
  };

  public readonly setSettingsVisible = (settingsVisible: boolean): void => {
    if (this.snapshot.settingsVisible === settingsVisible) return;
    this.update({ settingsVisible });
  };

  private update(change: Partial<EditorStateSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...change };
    for (const listener of this.listeners) listener();
  }
}
