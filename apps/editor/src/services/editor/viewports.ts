import {
  Difficulty,
  requiresPianoRoll,
  type VocalNoteKind,
  type VocalPhraseKind,
} from "@openchart/views";
import { StatefulService } from "../../platform/services";

export type ViewportKind = "piano-roll" | "highway";

export interface ViewportCameraState {
  tick: number;
  pianoRoll?: unknown;
  highway?: unknown;
}

/**
 * Instruments without difficulties (Vocals) can only be shown in the Piano
 * Roll. Applied on every update so selecting one from the TrackList lands on
 * the Piano Roll.
 */
export function enforceViewForInstrument(
  session: ViewportSession,
): ViewportSession {
  return session.view !== "piano-roll" &&
    (requiresPianoRoll(session.instrument) ||
      requiresPianoRoll(session.trackKey))
    ? { ...session, view: "piano-roll" }
    : session;
}

/** Highway tools and phrase modes. Mirrors the Highway view's `HighwayMode`. */
export type HighwayToolMode =
  "select" | "place" | "remove" | "stagepower" | "solo";

/** Mirrors the Highway view's `DrumPlacementKind`. */
export type DrumPlacement = "pad" | "cymbal" | "kick";

/** Mirrors the Highway view's `HighwayNotePlacementType`. */
export type NotePlacement = "normal" | "force-hopo" | "force-strum" | "tap";

/** Mirrors the Piano Roll's `VocalPlacement`. */
export interface VocalToolPlacement {
  noteKind: VocalNoteKind;
  /** When set, a grid drag creates this phrase instead of a note. */
  phrase: VocalPhraseKind | null;
}

/**
 * Per-viewport editing tools. Kept in the session (not component state) so
 * actions, and therefore hotkeys, can change them.
 */
export interface ViewportTools {
  highwayMode: HighwayToolMode;
  drumPlacementKind: DrumPlacement;
  notePlacementType: NotePlacement;
  vocalPlacement: VocalToolPlacement;
}

export function createViewportTools(): ViewportTools {
  return {
    highwayMode: "select",
    drumPlacementKind: "pad",
    notePlacementType: "normal",
    vocalPlacement: { noteKind: "pitched", phrase: null },
  };
}

export interface ViewportSession {
  id: string;
  view: ViewportKind;
  trackKey: string;
  instrument: string;
  difficulty: Difficulty;
  camera: ViewportCameraState;
  tools: ViewportTools;
}

export interface ViewportSnapshot {
  viewportSessions: readonly ViewportSession[];
  activeViewportId: string;
  maxViewportCount: number;
  activeViewId: string;
  snapEnabled: boolean;
  snapDenominator: number;
  lockCursor: boolean;
  getViewport: (id: string) => ViewportSession | undefined;
  getActiveViewport: () => ViewportSession | undefined;
}

const DEFAULT_VIEWPORT_ID = "viewport-1";
const DEFAULT_TRACK_KEY = "lead-guitar";

function createViewportSession(
  id: string,
  view: ViewportKind = "piano-roll",
  cameraTick = 0,
): ViewportSession {
  return {
    id,
    view,
    trackKey: DEFAULT_TRACK_KEY,
    instrument: "LEAD GUITAR",
    difficulty: Difficulty.Expert,
    camera: { tick: cameraTick },
    tools: createViewportTools(),
  };
}
const defaultViewportSnapshot: ViewportSnapshot = {
  viewportSessions: [createViewportSession(DEFAULT_VIEWPORT_ID)],
  activeViewportId: DEFAULT_VIEWPORT_ID,
  maxViewportCount: 4,
  activeViewId: "piano-roll",
  snapEnabled: true,
  snapDenominator: 4,
  lockCursor: true,
  getViewport: (id: string) =>
    defaultViewportSnapshot.viewportSessions.find((v) => v.id === id),
  getActiveViewport: () =>
    defaultViewportSnapshot.viewportSessions.find(
      (v) => v.id === defaultViewportSnapshot.activeViewportId,
    ),
};

export class ViewportService extends StatefulService<ViewportSnapshot> {
  private viewportSessions: ViewportSession[] = [
    createViewportSession(DEFAULT_VIEWPORT_ID),
  ];
  private activeViewportId = DEFAULT_VIEWPORT_ID;
  private maxViewportCount = 4;
  private activeViewId = "piano-roll";
  private snapEnabled = true;
  private snapDenominator = 4;
  private lockCursor = true;

  constructor() {
    super();
    this._snapshot = this.buildSnapshot();
  }

  public readonly reset = (): void => {
    this.viewportSessions = [createViewportSession(DEFAULT_VIEWPORT_ID)];
    this.activeViewportId = defaultViewportSnapshot.activeViewportId;
    this.maxViewportCount = defaultViewportSnapshot.maxViewportCount;
    this.activeViewId = defaultViewportSnapshot.activeViewId;
    this.snapEnabled = defaultViewportSnapshot.snapEnabled;
    this.snapDenominator = defaultViewportSnapshot.snapDenominator;
    this.lockCursor = defaultViewportSnapshot.lockCursor;
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
      createViewportSession(
        created,
        view,
        this.viewportSessions[0]?.camera.tick ?? 0,
      ),
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
    const session = this.viewportSessions.find((item) => item.id === id);
    if (this.activeViewportId === id && session?.view === this.activeViewId) {
      return;
    }

    this.activeViewportId = id;
    if (session) this.activeViewId = session.view;
    this.publish();
  };

  public readonly updateViewport = (
    id: string,
    update: Partial<Omit<ViewportSession, "id">>,
  ): void => {
    const current = this.getViewport(id);
    if (!current) return;

    const previousView = current.view;
    const cameraTick =
      update.camera?.tick ?? this.viewportSessions[0]!.camera.tick;
    this.viewportSessions = this.viewportSessions.map((session) => {
      const updated =
        session.id === id
          ? enforceViewForInstrument({
              ...session,
              ...update,
              camera: update.camera
                ? { ...session.camera, ...update.camera }
                : session.camera,
            })
          : session;
      return updated.camera.tick === cameraTick
        ? updated
        : { ...updated, camera: { ...updated.camera, tick: cameraTick } };
    });
    const updated = this.getViewport(id);
    if (
      id === this.activeViewportId &&
      updated &&
      (update.view || updated.view !== previousView)
    ) {
      this.activeViewId = updated.view;
    }
    this.publish();
  };

  /** Merges a partial update into a viewport's editing tools. */
  public readonly updateTools = (
    id: string,
    update: Partial<ViewportTools>,
  ): void => {
    const current = this.getViewport(id);
    if (!current) return;
    this.viewportSessions = this.viewportSessions.map((session) =>
      session.id === id
        ? { ...session, tools: { ...session.tools, ...update } }
        : session,
    );
    this.publish();
  };

  public readonly setSnapEnabled = (enabled: boolean): void => {
    if (this.snapEnabled === enabled) return;
    this.snapEnabled = enabled;
    this.publish();
  };

  public readonly setLockCursor = (locked: boolean): void => {
    if (this.lockCursor === locked) return;
    this.lockCursor = locked;
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

  public readonly getViewport = (id: string): ViewportSession | undefined => {
    return this.viewportSessions.find((item) => item.id === id);
  };

  public readonly getActiveViewport = (): ViewportSession | undefined => {
    return this.getViewport(this.activeViewportId);
  };

  private buildSnapshot(): ViewportSnapshot {
    return {
      viewportSessions: this.viewportSessions,
      activeViewportId: this.activeViewportId,
      maxViewportCount: this.maxViewportCount,
      activeViewId: this.activeViewId,
      snapEnabled: this.snapEnabled,
      snapDenominator: this.snapDenominator,
      lockCursor: this.lockCursor,
      getViewport: (id: string) => this.getViewport(id),
      getActiveViewport: () => this.getViewport(this.activeViewportId),
    };
  }

  private publish(): void {
    this._snapshot = this.buildSnapshot();
    this.notify();
  }
}
