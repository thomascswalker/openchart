import type {
  EditingSession,
  Projection,
  ProjectionRow,
  VocalLaneSpec,
  VocalLayout,
  VocalNoteKind,
  VocalPhraseKind,
} from "@openchart/views";
import { formatNoteId, VocalTrackView } from "@openchart/views";
import type { PitchRange } from "../../../audio/soundboard";

/** How a note is drawn and edited. Generic notes are plain pitched notes. */
export type PianoRollNoteKind =
  "generic" | VocalNoteKind | `phrase:${VocalPhraseKind}` | "unknown";

/** Pinned lane ids come from the vocal projection (derived from the ruleset). */
export type PinnedLaneId = string;
export type LaneDef = VocalLaneSpec;
export type PianoRollProfileId = "midi.raw" | "vocals";

export interface PianoRollHeaderOptions {
  textLane: "all" | "lyrics";
  createOnClick: boolean;
  deleteText: boolean;
  dragText: boolean;
  clipLabels: boolean;
}

export interface PianoRollProfile {
  id: PianoRollProfileId;
  pitchRange: PitchRange;
  pinnedLanes: readonly LaneDef[];
  keyboardLabels: boolean;
  header: PianoRollHeaderOptions;
  vocal: VocalLayout | null;
  classify(pitch: number): PianoRollNoteKind;
  laneForPitch(pitch: number): LaneDef | null;
}

const GenericHeader: PianoRollHeaderOptions = Object.freeze({
  textLane: "all",
  createOnClick: true,
  deleteText: true,
  dragText: true,
  clipLabels: false,
});

const VocalHeader: PianoRollHeaderOptions = Object.freeze({
  textLane: "lyrics",
  createOnClick: false,
  deleteText: false,
  dragText: false,
  clipLabels: true,
});

/** Raw MIDI mode: any pitch from 0 through 127 and no pinned lanes. */
export const GENERIC_PROFILE: PianoRollProfile = Object.freeze({
  id: "midi.raw",
  pitchRange: Object.freeze({ low: 0, high: 127 }),
  pinnedLanes: Object.freeze([]),
  keyboardLabels: false,
  header: GenericHeader,
  vocal: null,
  classify: () => "generic",
  laneForPitch: () => null,
});

/** Builds the Piano Roll projection directly from its active editing session. */
export function profileFromSession(session: EditingSession): PianoRollProfile {
  const projection = session.getProjection();
  if (session.mode.id === "midi.raw") return GENERIC_PROFILE;
  if (session.mode.id !== "vocals") {
    throw new Error(
      `Piano Roll does not support editing mode '${session.mode.id}'`,
    );
  }

  const rows = projection.getRows();
  const pitchRows = rows.filter((row) => row.kind === "pitched");
  if (pitchRows.length === 0) {
    throw new Error("Vocal Piano Roll projection has no pitched rows");
  }
  const pitchValues = pitchRows.map((row) => Number(row.id));
  const range = {
    low: Math.min(...pitchValues),
    high: Math.max(...pitchValues),
  };
  const laneRows = rows.filter((row) => row.kind !== "pitched");
  const lanes = laneRows.map((row) =>
    laneFromProjection(row, projection, session),
  );
  // The layout comes from the session's rules; the projection only supplies
  // rows (pitched range and pinned lanes) to draw.
  const rules = session.rules.byKey.get(session.target.trackKey);
  if (!rules) {
    throw new Error(`Vocal track '${session.target.trackKey}' has no rules`);
  }
  const layout = VocalTrackView.layoutFromRules(rules);
  const laneByPitch = new Map<number, LaneDef>();
  for (const lane of lanes) {
    for (const pitch of lane.pitches) laneByPitch.set(pitch, lane);
  }

  return {
    id: "vocals",
    pitchRange: { low: range.low, high: range.high },
    pinnedLanes: lanes,
    keyboardLabels: true,
    header: VocalHeader,
    vocal: layout,
    classify: (pitch) => {
      const row = rowForPitch(projection, pitch);
      if (!row) return "unknown";
      return row.kind === "pitched"
        ? "pitched"
        : (row.kind as PianoRollNoteKind);
    },
    laneForPitch: (pitch) => laneByPitch.get(pitch) ?? null,
  };
}

function laneFromProjection(
  row: ProjectionRow,
  projection: Projection,
  session: EditingSession,
): LaneDef {
  const pitches = Array.from({ length: 128 }, (_, pitch) => pitch).filter(
    (pitch) => rowForPitch(projection, pitch)?.id === row.id,
  );
  const createPitch =
    projection.pitchForRow(row, session.getToolState()) ?? pitches[0];
  if (createPitch === undefined) {
    throw new Error(`Vocal lane '${row.id}' has no creation pitch`);
  }
  const phrase = row.kind.startsWith("phrase:")
    ? (row.kind.slice("phrase:".length) as VocalPhraseKind)
    : null;
  const kind = phrase
    ? (`phrase:${phrase}` as const)
    : (row.kind as VocalNoteKind);
  return {
    id: row.id,
    label: row.label,
    pitches,
    createPitch,
    kind,
    phrase,
  };
}

function rowForPitch(projection: Projection, pitch: number) {
  return projection.rowForNote({
    id: formatNoteId(0, `preview-${pitch}`),
    trackIndex: 0,
    tick: 0,
    pitch,
    duration: 1,
    velocity: 100,
  });
}

/** Scientific pitch name with C4 = 60. */
export function pitchName(pitch: number): string {
  const names = [
    "C",
    "C#",
    "D",
    "D#",
    "E",
    "F",
    "F#",
    "G",
    "G#",
    "A",
    "A#",
    "B",
  ];
  return `${names[((pitch % 12) + 12) % 12]}${Math.floor(pitch / 12) - 1}`;
}

export function gridTopFor(
  profile: PianoRollProfile,
  headerHeight: number,
  laneHeight: number,
) {
  return headerHeight + profile.pinnedLanes.length * laneHeight;
}
