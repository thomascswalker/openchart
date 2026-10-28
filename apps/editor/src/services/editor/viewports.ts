import {
  Difficulty,
  EditingModeRegistry,
  type CompiledRuleset,
  type EditingModeId,
  type ModeRegistry,
  type TrackDescriptor,
} from "@openchart/views";
import { defaultModes } from "@openchart/views";
import { StatefulService } from "../../platform/services";
import type { RulesetService } from "../ruleset";

export type ViewportKind = "piano-roll" | "highway";

export interface ViewportCameraState {
  tick: number;
  pianoRoll?: unknown;
  highway?: unknown;
}

/** Keeps each viewport on a host supported by its resolved editing mode. */
export function enforceAvailableView(
  session: ViewportSession,
  canHost: (session: ViewportSession, hostKind: ViewportKind) => boolean,
): ViewportSession {
  if (canHost(session, session.view)) return session;
  if (canHost(session, "piano-roll")) {
    return { ...session, view: "piano-roll" };
  }
  if (canHost(session, "highway")) {
    return { ...session, view: "highway" };
  }
  return session;
}

export interface ViewportSession {
  id: string;
  view: ViewportKind;
  trackKey: string;
  instrument: string;
  difficulty: Difficulty;
  camera: ViewportCameraState;
  tools: Record<string, unknown>;
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
const DEFAULT_MAX_VIEWPORT_COUNT = 4;
const DEFAULT_VIEW_ID = "piano-roll";

/** The track new viewports open on: the first visible, editable track. */
function defaultTrack(rules: CompiledRuleset): TrackDescriptor {
  const descriptors = rules.descriptors();
  const found =
    descriptors.find((track) => track.visible && track.editable) ??
    descriptors.find((track) => track.visible) ??
    descriptors[0];
  if (!found) throw new Error("The ruleset defines no tracks.");
  return found;
}

function createViewportSession(
  id: string,
  track: Pick<TrackDescriptor, "key" | "name">,
  view: ViewportKind = "piano-roll",
  cameraTick = 0,
): ViewportSession {
  return {
    id,
    view,
    trackKey: track.key,
    instrument: track.name,
    difficulty: Difficulty.Expert,
    camera: { tick: cameraTick },
    tools: Object.fromEntries(
      defaultModes.map((mode) => [
        mode.id,
        mode.toolStateSchema.parse(mode.createDefaultToolState()),
      ]),
    ) as Record<string, unknown>,
  };
}

export class ViewportService extends StatefulService<ViewportSnapshot> {
  public static dependencies = ["ruleset"];

  private readonly rulesetService: RulesetService;
  private viewportSessions: ViewportSession[];
  private activeViewportId = DEFAULT_VIEWPORT_ID;
  private maxViewportCount = DEFAULT_MAX_VIEWPORT_COUNT;
  private activeViewId = DEFAULT_VIEW_ID;
  private snapEnabled = true;
  private snapDenominator = 4;
  private lockCursor = true;
  private modeRegistry: ModeRegistry | null = null;
  /** Always set: resolves from the ruleset until EditingService replaces it. */
  private trackResolver: (session: ViewportSession) => TrackDescriptor = (
    session,
  ) => this.resolveFromRules(session);

  constructor(rulesetService: RulesetService) {
    super();
    this.rulesetService = rulesetService;
    this.viewportSessions = [
      createViewportSession(
        DEFAULT_VIEWPORT_ID,
        defaultTrack(rulesetService.compiled),
      ),
    ];
    rulesetService.subscribe(this.syncRuleset);
    const registry = new EditingModeRegistry();
    defaultModes.forEach((mode) => registry.register(mode));
    this.modeRegistry = registry;
    this._snapshot = this.buildSnapshot();
  }

  public readonly setModeRegistry = (registry: ModeRegistry): void => {
    this.modeRegistry = registry;
  };

  public readonly setTrackResolver = (
    resolver: (session: ViewportSession) => TrackDescriptor,
  ): void => {
    this.trackResolver = resolver;
  };

  public readonly reset = (): void => {
    this.viewportSessions = [
      createViewportSession(
        DEFAULT_VIEWPORT_ID,
        defaultTrack(this.rulesetService.compiled),
      ),
    ];
    this.activeViewportId = DEFAULT_VIEWPORT_ID;
    this.maxViewportCount = DEFAULT_MAX_VIEWPORT_COUNT;
    this.activeViewId = DEFAULT_VIEW_ID;
    this.snapEnabled = true;
    this.snapDenominator = 4;
    this.lockCursor = true;
    this.publish();
  };

  /**
   * When the ruleset changes, viewports whose track no longer exists move to
   * the default track, then every viewport is re-checked against the modes
   * available for its (possibly different) track.
   */
  private readonly syncRuleset = (): void => {
    const rules = this.rulesetService.compiled;
    const fallback = defaultTrack(rules);
    this.viewportSessions = this.viewportSessions.map((session) => {
      const exists =
        rules.byKey.has(session.trackKey) ||
        session.trackKey.startsWith("unmapped-");
      const next = exists
        ? session
        : {
            ...session,
            trackKey: fallback.key,
            instrument: fallback.name,
          };
      return enforceAvailableView(next, (target, hostKind) =>
        this.canHost(target, hostKind),
      );
    });
    const active = this.getViewport(this.activeViewportId);
    if (active) this.activeViewId = active.view;
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
        defaultTrack(this.rulesetService.compiled),
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
          ? enforceAvailableView(
              {
                ...session,
                ...update,
                camera: update.camera
                  ? { ...session.camera, ...update.camera }
                  : session.camera,
              },
              (target, hostKind) => this.canHost(target, hostKind),
            )
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

  /** Stores a mode's tool state; EditingService validates updates by schema. */
  public readonly setModeToolState = (
    id: string,
    modeId: EditingModeId,
    state: unknown,
  ): void => {
    const current = this.getViewport(id);
    if (!current) return;
    this.viewportSessions = this.viewportSessions.map((session) =>
      session.id === id
        ? { ...session, tools: { ...session.tools, [modeId]: state } }
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

  private resolveFromRules(session: ViewportSession): TrackDescriptor {
    const rules = this.rulesetService.compiled;
    const found = rules
      .descriptors()
      .find(
        (item) =>
          item.key === session.trackKey || item.name === session.instrument,
      );
    return found ?? defaultTrack(rules);
  }

  private canHost(session: ViewportSession, hostKind: ViewportKind): boolean {
    if (!this.modeRegistry) return false;
    return this.modeRegistry.canHost(this.trackResolver(session), hostKind);
  }
}
