import {
  classifyVocalPitch,
  findTrackConfig,
  isVocalTrackConfig,
  vocalLayoutFromConfig,
  type VocalLayout,
  type VocalNoteKind,
  type VocalPhraseKind,
} from "@openchart/views";
import { MaximumMidiPitch, MinimumMidiPitch } from "./constants";

/** How a note is drawn and edited. Default notes are plain pitched notes. */
export type PianoRollNoteKind =
  "default" | VocalNoteKind | `phrase:${VocalPhraseKind}` | "unknown";

/** Identifies a pinned lane. */
export type PinnedLaneId =
  "vocal-phrase" | "power-window" | "stagepower" | "percussion" | "pitchless";

/** Inclusive range of MIDI pitches. */
export interface PitchRange {
  /** Lowest pitch in the range. */
  readonly low: number;

  /** Highest pitch in the range. */
  readonly high: number;
}

/**
 * A row between the header and the pitch grid. Pinned lanes do not scroll
 * vertically, and scale with the pitch rows so special pitches stay visible.
 */
export interface LaneDef {
  /** Stable identifier of the lane. */
  id: PinnedLaneId;

  /** Short text shown in the lane's keyboard-gutter label. */
  label: string;

  /** Every pitch drawn in this lane. */
  pitches: readonly number[];

  /** Pitch written when a note is created by dragging in the lane. */
  createPitch: number;

  /** How notes in this lane are drawn and edited. */
  kind: PianoRollNoteKind;

  /** Phrases draw as translucent bands; notes draw as solid blocks. */
  phrase: VocalPhraseKind | null;
}

/** Header behaviour that differs between profiles. */
export interface PianoRollHeaderOptions {
  /** Which text meta events the header's text lane shows. */
  textLane: "all" | "lyrics";

  /** Clicking the empty text lane creates `[section New]`. */
  createOnClick: boolean;

  /** Right-click and the × button delete text events. */
  deleteText: boolean;

  /** Text labels can be dragged to a new tick. */
  dragText: boolean;

  /** Labels are clipped at the next label's X so lyrics stay readable. */
  clipLabels: boolean;
}

/** Everything that differs between instruments in the piano roll. */
export interface PianoRollProfile {
  /** Which profile this is. */
  id: "default" | "vocals";

  /** Inclusive pitch range of the scrolling grid. Rows outside are dimmed. */
  pitchRange: PitchRange;

  /** Lanes pinned between the header and the pitch grid. */
  pinnedLanes: readonly LaneDef[];

  /** Octave labels (C2…C6) on the keyboard. */
  keyboardLabels: boolean;

  /** Which editing strategy handles gestures. */
  editing: "default" | "vocal";

  /** Header behaviour. */
  header: PianoRollHeaderOptions;

  /** MIDI track the profile edits when no track index is selected yet. */
  trackName: string | null;

  /** Vocal pitch layout, or null for non-vocal profiles. */
  vocal: VocalLayout | null;

  /** Resolves how a note at `pitch` is drawn and edited. */
  classify(pitch: number): PianoRollNoteKind;

  /** The pinned lane that draws `pitch`, or null for ordinary grid pitches. */
  laneForPitch(pitch: number): LaneDef | null;
}

/** Reproduces the Piano Roll's original 0-127 behaviour exactly. */
export const DefaultProfile: PianoRollProfile = Object.freeze({
  id: "default",
  pitchRange: Object.freeze({
    low: MinimumMidiPitch,
    high: MaximumMidiPitch,
  }),
  pinnedLanes: Object.freeze([]) as readonly LaneDef[],
  keyboardLabels: false,
  editing: "default",
  header: Object.freeze({
    textLane: "all",
    createOnClick: true,
    deleteText: true,
    dragText: true,
    clipLabels: false,
  }),
  trackName: null,
  vocal: null,
  classify: () => "default",
  laneForPitch: () => null,
}) as PianoRollProfile;

/** Note names within an octave, indexed by pitch class. */
const PitchClassNames = [
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
] as const;

/** Profiles already built, keyed by instrument or track name. */
const ProfileCache = new Map<string, PianoRollProfile>();

/** Describes one pinned lane that holds a single phrase pitch. */
function createPhraseLane(
  id: PinnedLaneId,
  label: string,
  pitch: number,
  phrase: VocalPhraseKind,
): LaneDef {
  return {
    id,
    label,
    pitches: [pitch],
    createPitch: pitch,
    kind: `phrase:${phrase}`,
    phrase,
  };
}

/** Describes one pinned lane that holds a single solid-note pitch. */
function createNoteLane(
  id: PinnedLaneId,
  label: string,
  pitches: readonly number[],
  createPitch: number,
  kind: "percussion" | "pitchless",
): LaneDef {
  return { id, label, pitches, createPitch, kind, phrase: null };
}

/** Lists the pinned lanes of a vocals profile, top to bottom. */
function createVocalLanes(layout: VocalLayout): LaneDef[] {
  return [
    createPhraseLane("vocal-phrase", "Phrase", layout.vocalPhrase, "vocal"),
    createPhraseLane(
      "power-window",
      "Power",
      layout.powerWindow,
      "power-window",
    ),
    createPhraseLane("stagepower", "Stage", layout.power, "stagepower"),
    createNoteLane(
      "percussion",
      "Perc",
      [layout.percussion],
      layout.percussion,
      "percussion",
    ),
    createNoteLane(
      "pitchless",
      "Spoken",
      [layout.pitchlessHigh, layout.pitchlessLow],
      layout.pitchlessPlacement,
      "pitchless",
    ),
  ];
}

/** Maps every pitch held by a pinned lane to that lane. */
function indexLanesByPitch(lanes: readonly LaneDef[]): Map<number, LaneDef> {
  const laneByPitch = new Map<number, LaneDef>();

  for (const lane of lanes) {
    for (const pitch of lane.pitches) laneByPitch.set(pitch, lane);
  }

  return laneByPitch;
}

/** Resolves how a note at `pitch` is drawn in the given vocal layout. */
function classifyVocalNoteKind(
  layout: VocalLayout,
  pitch: number,
): PianoRollNoteKind {
  const classification = classifyVocalPitch(layout, pitch);

  if (classification.type === "note") return classification.kind;
  if (classification.type === "phrase") return `phrase:${classification.kind}`;
  return "unknown";
}

/** Builds the profile used to edit a vocal track. */
export function createVocalsProfile(
  layout: VocalLayout,
  trackName = "VOCALS",
): PianoRollProfile {
  const lanes = createVocalLanes(layout);
  const laneByPitch = indexLanesByPitch(lanes);

  return {
    id: "vocals",
    pitchRange: { ...layout.range },
    pinnedLanes: lanes,
    keyboardLabels: true,
    editing: "vocal",
    header: {
      textLane: "lyrics",
      createOnClick: false,
      deleteText: false,
      dragText: false,
      clipLabels: true,
    },
    trackName,
    vocal: layout,
    classify: (pitch) => classifyVocalNoteKind(layout, pitch),
    laneForPitch: (pitch) => laneByPitch.get(pitch) ?? null,
  };
}

/** Derives the profile for a viewport's instrument (or track name). */
export function profileForInstrument(instrument: string): PianoRollProfile {
  const cached = ProfileCache.get(instrument);
  if (cached) {
    return cached;
  }

  // Vocal instruments get the vocals profile; everything else is default.
  const config = findTrackConfig(instrument);
  const profile =
    config && isVocalTrackConfig(config)
      ? createVocalsProfile(vocalLayoutFromConfig(config), config.name)
      : DefaultProfile;

  ProfileCache.set(instrument, profile);
  return profile;
}

/** Pitch name where C4 => 60 (e.g. 36 => C2, 84 => C6, etc.) */
export function pitchName(pitch: number): string {
  const pitchClass = ((pitch % 12) + 12) % 12;
  const octave = Math.floor(pitch / 12) - 1;
  return `${PitchClassNames[pitchClass]}${octave}`;
}

/**
 * Screen Y where the scrolling pitch grid starts: below the header and one
 * `laneHeight` row per pinned lane.
 */
export function gridTopFor(
  profile: PianoRollProfile,
  headerHeight: number,
  laneHeight: number,
): number {
  return headerHeight + profile.pinnedLanes.length * laneHeight;
}
