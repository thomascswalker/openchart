import { Difficulty } from "@midiedit/views";
import { IStatefulService } from "../../platform/services";

export type ViewportKind = "piano-roll" | "highway";

export interface ViewportCameraState {
  tick: number;
  pianoRoll?: unknown;
  highway?: unknown;
}

export interface ViewportSession {
  id: string;
  view: ViewportKind;
  trackKey: string;
  instrument: string;
  difficulty: Difficulty;
  camera: ViewportCameraState;
}

export interface ViewportSnapshot {
  viewportSessions: readonly ViewportSession[];
  activeViewportId: string;
  maxViewportCount: number;
  activeViewId: string;
  snapEnabled: boolean;
  snapDenominator: number;
}

const DEFAULT_VIEWPORT_ID = "viewport-1";
const DEFAULT_TRACK_KEY = "lead-guitar";

function createViewportSession(
  id: string,
  view: ViewportKind = "piano-roll",
): ViewportSession {
  return {
    id,
    view,
    trackKey: DEFAULT_TRACK_KEY,
    instrument: "LEAD GUITAR",
    difficulty: Difficulty.Expert,
    camera: { tick: 0 },
  };
}

export class ViewportService extends IStatefulService<ViewportSnapshot> {
  private readonly listeners = new Set<() => void>();
  private viewportSessions: ViewportSession[] = [
    createViewportSession(DEFAULT_VIEWPORT_ID),
  ];
  private activeViewportId = DEFAULT_VIEWPORT_ID;
  private maxViewportCount = 4;
  private activeViewId = "piano-roll";
  private snapEnabled = true;
  private snapDenominator = 4;
  private snapshot = this.createSnapshot();

  public readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  public readonly getSnapshot = (): ViewportSnapshot => this.snapshot;

  public readonly reset = (): void => {
    this.viewportSessions = [createViewportSession(DEFAULT_VIEWPORT_ID)];
    this.activeViewportId = DEFAULT_VIEWPORT_ID;
    this.maxViewportCount = 4;
    this.activeViewId = "piano-roll";
    this.snapEnabled = true;
    this.snapDenominator = 4;
    this.publish();
  };

  public readonly setMaxViewportCount = (count: number): void => {
    const next = Math.max(1, Math.min(4, Math.floor(count)));
    this.maxViewportCount = next;
    this.viewportSessions = this.viewportSessions.slice(0, next);
    if (!this.viewportSessions.some(({ id }) => id === this.activeViewportId)) {
      this.activeViewportId =
        this.viewportSessions[0]?.id ?? DEFAULT_VIEWPORT_ID;
    }
    this.publish();
  };

  public readonly addViewport = (
    view: ViewportKind,
    afterId?: string,
  ): string | null => {
    if (this.viewportSessions.length >= this.maxViewportCount) return null;
    const created = `viewport-${Date.now()}-${this.viewportSessions.length + 1}`;
    const afterIndex = this.viewportSessions.findIndex(
      (session) => session.id === afterId,
    );
    const insertAt =
      afterIndex < 0 ? this.viewportSessions.length : afterIndex + 1;
    this.viewportSessions = [
      ...this.viewportSessions.slice(0, insertAt),
      createViewportSession(created, view),
      ...this.viewportSessions.slice(insertAt),
    ];
    this.activeViewportId = created;
    this.activeViewId = view;
    this.publish();
    return created;
  };

  public readonly closeViewport = (id: string): boolean => {
    if (
      this.viewportSessions.length <= 1 ||
      !this.viewportSessions.some((session) => session.id === id)
    ) {
      return false;
    }
    this.viewportSessions = this.viewportSessions.filter(
      (session) => session.id !== id,
    );
    if (this.activeViewportId === id) {
      this.activeViewportId = this.viewportSessions[0]!.id;
      this.activeViewId = this.viewportSessions[0]!.view;
    }
    this.publish();
    return true;
  };

  public readonly focusViewport = (id: string): void => {
    this.activeViewportId = id;
    const session = this.viewportSessions.find((item) => item.id === id);
    if (session) this.activeViewId = session.view;
    this.publish();
  };

  public readonly updateViewport = (
    id: string,
    update: Partial<Omit<ViewportSession, "id">>,
  ): void => {
    this.viewportSessions = this.viewportSessions.map((session) =>
      session.id === id
        ? {
            ...session,
            ...update,
            camera: update.camera
              ? { ...session.camera, ...update.camera }
              : session.camera,
          }
        : session,
    );
    if (id === this.activeViewportId && update.view) {
      this.activeViewId = update.view;
    }
    this.publish();
  };

  public readonly setSnapEnabled = (enabled: boolean): void => {
    if (this.snapEnabled === enabled) return;
    this.snapEnabled = enabled;
    this.publish();
  };

  public readonly setSnapDenominator = (denominator: number): void => {
    if (this.snapDenominator === denominator) return;
    this.snapDenominator = denominator;
    this.publish();
  };

  public readonly setActiveView = (id: string): void => {
    if (this.activeViewId === id) return;
    this.activeViewId = id;
    this.publish();
  };

  public readonly getViewport = (id: string): ViewportSession | undefined =>
    this.viewportSessions.find((item) => item.id === id);

  private createSnapshot(): ViewportSnapshot {
    return {
      viewportSessions: this.viewportSessions,
      activeViewportId: this.activeViewportId,
      maxViewportCount: this.maxViewportCount,
      activeViewId: this.activeViewId,
      snapEnabled: this.snapEnabled,
      snapDenominator: this.snapDenominator,
    };
  }

  private publish(): void {
    this.snapshot = this.createSnapshot();
    for (const listener of this.listeners) listener();
  }
}
