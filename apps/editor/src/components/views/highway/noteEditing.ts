import type { MidiChannelEvent, MidiNote } from "@midiedit/core";
import type { ChartView } from "@midiedit/views";
import type { HighwayContext } from "./context";
import { laneCount } from "./constants";
import { HighwayCoordinateSystem } from "./coordinates";
import {
  getSustainCutTargets,
  minimumMidiNoteDurationTicks,
} from "./interaction";
import type { HighwayClipboardNote } from "./types";
import { getDrumNoteProfile, getDrumPitchForPlacement } from "./drumProfile";
import { drumLaneCount } from "./drumProfile";

export class HighwayNoteEditingController {
  private readonly context: HighwayContext;
  private readonly coordinates: HighwayCoordinateSystem;
  private clipboard: HighwayClipboardNote[] = [];

  public constructor(
    context: HighwayContext,
    coordinates: HighwayCoordinateSystem,
  ) {
    this.context = context;
    this.coordinates = coordinates;
  }

  public canCopySelection(): boolean {
    const chart = this.context.getCurrentChart();
    const selection = this.context.getSelectionContext();
    return (
      chart?.getNotes().some((note) => selection.isSelected(note.noteOn)) ??
      false
    );
  }

  public canCutSelection(): boolean {
    return !this.context.getState().isPlaying && this.canCopySelection();
  }

  public canPasteClipboard(): boolean {
    return !this.context.getState().isPlaying && this.clipboard.length > 0;
  }

  public copySelection(): void {
    const chart = this.context.getCurrentChart();
    const selection = this.context.getSelectionContext();
    const notes = (chart?.getNotes() ?? []).filter((note) =>
      selection.isSelected(note.noteOn),
    );
    if (notes.length === 0) return;
    const firstTick = Math.min(...notes.map((note) => note.start));
    const offset = chart?.getOffset() ?? 0;
    const isDrums = chart ? this.isDrumChart(chart) : false;
    const laneForNote = (note: MidiNote): number => {
      const profile = isDrums ? getDrumNoteProfile(note.note, offset) : null;
      if (profile?.kind === "kick") return 0;
      return profile?.lane ?? profile?.slot ?? note.note - offset;
    };
    const firstLane = Math.min(...notes.map(laneForNote));
    this.clipboard = notes.map((note) => {
      const profile = isDrums ? getDrumNoteProfile(note.note, offset) : null;
      return {
        relativeTick: note.start - firstTick,
        relativeLane: laneForNote(note) - firstLane,
        durationTicks: note.end - note.start,
        velocity: note.velocity,
        ...(profile
          ? { drumKind: profile.kind, originalPitch: note.note }
          : {}),
      };
    });
  }

  public cutSelection(): void {
    const chart = this.context.getCurrentChart();
    if (!chart || !this.canCutSelection()) return;
    this.copySelection();
    const selection = this.context.getSelectionContext();
    let changed = false;
    for (const note of chart.getNotes()) {
      if (selection.isSelected(note.noteOn)) {
        changed = chart.removeNote(note) || changed;
      }
    }
    selection.clear();
    if (changed) this.context.notifyNotesChanged();
    this.context.requestRender();
  }

  public pasteClipboard(anchorTick: number, anchorLane: number): void {
    const chart = this.context.getCurrentChart();
    if (!chart || !this.canPasteClipboard()) return;
    const snappedAnchorTick = this.coordinates.snapTick(anchorTick);
    const originalNotes = new Set(chart.getNotes().map((note) => note.noteOn));
    const pasted = new Set<MidiChannelEvent>();
    const physicalLaneCount = this.isDrumChart(chart)
      ? drumLaneCount
      : laneCount;
    for (const entry of this.clipboard) {
      const lane = anchorLane + entry.relativeLane;
      if (lane < 0 || lane >= physicalLaneCount) continue;
      const start = Math.max(
        0,
        this.coordinates.snapTick(snappedAnchorTick + entry.relativeTick),
      );
      let pitch = lane + chart.getOffset();
      if (this.isDrumChart(chart) && entry.drumKind) {
        if (entry.drumKind === "marker") {
          if (entry.originalPitch === undefined) continue;
          pitch = entry.originalPitch;
        } else {
          const mappedPitch = getDrumPitchForPlacement(
            entry.drumKind,
            lane,
            chart.getOffset(),
          );
          if (mappedPitch === null) continue;
          pitch =
            entry.drumKind === "kick" && entry.originalPitch === 95
              ? 95
              : mappedPitch;
        }
        chart.addNoteAtPitch(
          pitch,
          start,
          start + entry.durationTicks,
          entry.velocity,
        );
      } else {
        chart.addNote(lane, start, start + entry.durationTicks, entry.velocity);
      }
      const note = chart
        .getNotes()
        .find(
          (candidate) =>
            !originalNotes.has(candidate.noteOn) &&
            !pasted.has(candidate.noteOn) &&
            candidate.note === pitch &&
            candidate.start === start &&
            candidate.end === start + entry.durationTicks,
        );
      if (note) pasted.add(note.noteOn);
    }
    if (pasted.size > 0) {
      this.context.getSelectionContext().set(pasted);
      this.context.notifyNotesChanged();
      this.context.requestRender();
    }
  }

  public placeNoteAt(
    chart: ChartView,
    lane: number,
    tick: number,
    shiftKey: boolean,
    preferredSustain: MidiNote | null = null,
  ): boolean {
    if (this.isDrumChart(chart)) {
      const pitch = getDrumPitchForPlacement(
        this.context.getDrumPlacementKind(),
        lane,
        chart.getOffset(),
      );
      if (pitch === null) return false;
      chart.addNote(
        pitch - chart.getOffset(),
        tick,
        tick + minimumMidiNoteDurationTicks,
      );
      return true;
    }
    const sameLanePlacement =
      preferredSustain !== null &&
      preferredSustain.note - chart.getOffset() === lane;
    this.cutSustainsAtTick(
      chart,
      tick,
      shiftKey,
      preferredSustain,
      sameLanePlacement,
    );
    chart.addNote(lane, tick, tick + minimumMidiNoteDurationTicks);
    return true;
  }

  public cutSustainsAtTick(
    chart: ChartView,
    tick: number,
    shiftKey: boolean,
    preferredSustain: MidiNote | null = null,
    sameLanePlacement = false,
  ): boolean {
    if (this.isDrumChart(chart)) return false;
    const targets = getSustainCutTargets(
      chart.getNotes(),
      tick,
      shiftKey,
      preferredSustain?.noteOn ?? null,
      sameLanePlacement,
    );
    let changed = false;
    for (const note of targets) {
      changed = chart.setNoteEnd(note, tick) || changed;
    }
    return changed;
  }

  public removeNote(
    chart: ChartView,
    note: MidiNote,
    removeFromSelection = true,
  ): boolean {
    const changed = chart.removeNote(note);
    if (changed && removeFromSelection) {
      this.context.getSelectionContext().remove(note.noteOn);
    }
    return changed;
  }

  public moveNote(
    chart: ChartView,
    note: MidiNote,
    lane: number,
    tick: number,
  ): boolean {
    if (!this.isDrumChart(chart)) return chart.moveNote(note, lane, tick);
    const profile = getDrumNoteProfile(note.note, chart.getOffset());
    if (!profile || profile.kind === "marker") return false;
    let pitch = getDrumPitchForPlacement(profile.kind, lane, chart.getOffset());
    if (pitch === null) return false;
    if (note.note === 95) pitch = 95;
    const track = chart.getTrack().getMidiTrack();
    if (!track) return false;
    chart.getSong().attachTrack(track);
    return track.setNotePitch(note, pitch) && track.setNoteStart(note, tick);
  }

  public resizeNote(
    chart: ChartView,
    note: MidiNote,
    endTick: number,
  ): boolean {
    return chart.setNoteEnd(note, endTick);
  }

  public deleteSelection(): boolean {
    const chart = this.context.getCurrentChart();
    const selection = this.context.getSelectionContext();
    if (!chart) return false;
    let changed = false;
    for (const note of chart.getNotes()) {
      if (selection.isSelected(note.noteOn)) {
        changed = chart.removeNote(note) || changed;
      }
    }
    selection.clear();
    if (changed) this.context.notifyNotesChanged();
    this.context.requestRender();
    return changed;
  }

  private isDrumChart(chart: ChartView): boolean {
    return (
      typeof chart.getTrack === "function" &&
      chart.getTrack().getKey() === "drums"
    );
  }
}
