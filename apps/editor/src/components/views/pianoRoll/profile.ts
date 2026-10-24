import {
  classifyVocalPitch,
  findTrackConfig,
  isVocalTrackConfig,
  vocalLaneSpecsFromLayout,
  vocalLayoutFromConfig,
  type VocalLaneId,
  type VocalLaneSpec,
  type VocalLayout,
  type VocalNoteKind,
  type VocalPhraseKind,
} from "@openchart/views";
import type { PitchRange } from "../../../audio/soundboard";

/** How a note is drawn and edited. Generic notes are plain pitched notes. */
export type PianoRollNoteKind =
  "generic" | VocalNoteKind | `phrase:${VocalPhraseKind}` | "unknown";

export type PinnedLaneId = VocalLaneId;

/**
 * A row between the header and the pitch grid. Pinned lanes do not scroll
 * vertically, and scale with the pitch rows so special pitches stay visible.
 */
export type LaneDef = VocalLaneSpec;

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

export type PianoRollEditingType = "generic" | "vocals";

export interface PianoRollProfile {
  id: PianoRollEditingType;
  /** Inclusive pitch range of the scrolling grid. Rows outside are dimmed. */
  pitchRange: PitchRange;
  pinnedLanes: readonly LaneDef[];
  /** Octave labels (C2...C6) on the keyboard. */
  keyboardLabels: boolean;
  editing: PianoRollEditingType;
  header: PianoRollHeaderOptions;
  /** MIDI track the profile edits when no track index is selected yet. */
  trackName: string | null;
  vocal: VocalLayout | null;
  classify(pitch: number): PianoRollNoteKind;
  laneForPitch(pitch: number): LaneDef | null;
}

/** Reproduces the Piano Roll's original 0-127 behaviour exactly. */
export const GENERIC_PROFILE: PianoRollProfile = Object.freeze({
  id: "generic",
  pitchRange: Object.freeze({ low: 0, high: 127 }),
  pinnedLanes: Object.freeze([]) as readonly LaneDef[],
  keyboardLabels: false,
  editing: "generic",
  header: Object.freeze({
    textLane: "all",
    createOnClick: true,
    deleteText: true,
    dragText: true,
    clipLabels: false,
  }),
  trackName: null,
  vocal: null,
  classify: () => "generic",
  laneForPitch: () => null,
}) as PianoRollProfile;

export function createVocalsProfile(
  layout: VocalLayout,
  trackName = "VOCALS",
): PianoRollProfile {
  const lanes = vocalLaneSpecsFromLayout(layout);
  const laneByPitch = new Map<number, LaneDef>();
  for (const lane of lanes) {
    for (const pitch of lane.pitches) laneByPitch.set(pitch, lane);
  }
  return {
    id: "vocals",
    pitchRange: { ...layout.range },
    pinnedLanes: lanes,
    keyboardLabels: true,
    editing: "vocals",
    header: {
      textLane: "lyrics",
      createOnClick: false,
      deleteText: false,
      dragText: false,
      clipLabels: true,
    },
    trackName,
    vocal: layout,
    classify(pitch) {
      const classification = classifyVocalPitch(layout, pitch);
      return classification.type === "note"
        ? classification.kind
        : classification.type === "phrase"
          ? `phrase:${classification.kind}`
          : "unknown";
    },
    laneForPitch: (pitch) => laneByPitch.get(pitch) ?? null,
  };
}

const profileCache = new Map<string, PianoRollProfile>();

/** Derives the profile for a viewport's instrument (or track name). */
export function profileForInstrument(instrument: string): PianoRollProfile {
  const cached = profileCache.get(instrument);
  if (cached) return cached;
  const config = findTrackConfig(instrument);
  const profile =
    config && isVocalTrackConfig(config)
      ? createVocalsProfile(vocalLayoutFromConfig(config), config.name)
      : GENERIC_PROFILE;
  profileCache.set(instrument, profile);
  return profile;
}

/** Scientific pitch name with C4 = 60 (so 36 is C2 and 84 is C6). */
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
