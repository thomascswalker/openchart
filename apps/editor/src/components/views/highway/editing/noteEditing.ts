import type { MidiChannelEvent, MidiNote } from "@openchart/midi";
import type { ChartView } from "@openchart/views";
import type { HighwayContext } from "../context";
import {
  getSustainCutTargets,
  minimumMidiNoteDurationTicks,
} from "../interaction";
import type { HighwayClipboardNote } from "../types";
import { getDrumNoteProfile, getDrumPitchForPlacement } from "../profile";
import type { HighwayNotePlacementType } from "../types";
import { DrumLaneCount } from "../profile";

export class HighwayNoteEditingController {
  private readonly context: HighwayContext;
  private clipboard: HighwayClipboardNote[] = [];

  public constructor(context: HighwayContext) {
    this.context = context;
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
    this.clipboard = notes.map((note) => {
      const profile = isDrums ? getDrumNoteProfile(note.note, offset) : null;
      return {
        relativeTick: note.start - firstTick,
        lane: laneForNote(note),
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

  public pasteClipboard(anchorTick: number): boolean {
    const chart = this.context.getCurrentChart();
    if (!chart || !this.canPasteClipboard()) {
      return false;
    }
    const originalNotes = new Set(chart.getNotes().map((note) => note.noteOn));
    const pasted = new Set<MidiChannelEvent>();
    const occupied = new Set(
      chart.getNotes().map((note) => `${note.note}:${note.start}`),
    );
    const physicalLaneCount = this.isDrumChart(chart)
      ? DrumLaneCount
      : chart.getLaneCount();

    for (const entry of this.clipboard) {
      const lane = entry.lane;
      if (lane < 0 || lane >= physicalLaneCount) continue;
      const start = Math.max(0, Math.round(anchorTick) + entry.relativeTick);
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
        if (occupied.has(`${pitch}:${start}`)) continue;
        chart.addNoteAtPitch(
          pitch,
          start,
          start + entry.durationTicks,
          entry.velocity,
        );
      } else {
        if (occupied.has(`${pitch}:${start}`)) continue;
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
      occupied.add(`${pitch}:${start}`);
      if (note) pasted.add(note.noteOn);
    }
    if (pasted.size > 0) {
      this.context.getSelectionContext().set(pasted);
      this.context.notifyNotesChanged();
      this.context.requestRender();
    }
    return pasted.size > 0;
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
    const added = chart.addNote(
      lane,
      tick,
      tick + minimumMidiNoteDurationTicks,
    );
    if (!added) {
      return false;
    }
    this.addNotePlacementMarker(
      chart,
      this.context.getNotePlacementType?.() ?? "normal",
      tick,
    );
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
    return chart.getTrack().getKey() === "drums";
  }

  private addNotePlacementMarker(
    chart: ChartView,
    type: HighwayNotePlacementType,
    tick: number,
  ): void {
    const midiTrack = chart.getTrack().getMidiTrack();
    if (!midiTrack) {
      return;
    }
    const descriptor = chart
      .getSong()
      .getTrackDescriptors()
      .find((item) => item.key === chart.getTrack().getKey());
    if (!descriptor || descriptor.config.type !== "instrument") {
      return;
    }
    const difficulty = Object.entries(descriptor.config.offsets ?? {}).find(
      ([, offset]) => offset === chart.getOffset(),
    )?.[0];
    if (!difficulty) {
      return;
    }

    const markerPitches = [
      descriptor.config.notes[`${difficulty}Hopo`],
      descriptor.config.notes[`${difficulty}Strum`],
      descriptor.config.notes[`${difficulty}Tap`],
    ].filter((pitch): pitch is number => pitch !== undefined);

    let key: string | undefined;
    switch (type) {
      case "force-hopo":
        key = `${difficulty}Hopo`;
        break;
      case "force-strum":
        key = `${difficulty}Strum`;
        break;
      case "tap":
        key = `${difficulty}Tap`;
        break;
    }
    const selectedPitch = key
      ? (descriptor.config.notes[key] ?? 104)
      : undefined;

    for (const note of midiTrack
      .getNotes()
      .filter(
        (candidate) =>
          markerPitches.includes(candidate.note) &&
          candidate.start === tick &&
          candidate.note !== selectedPitch,
      )) {
      midiTrack.removeNote(note.noteOn, note.noteOff);
    }

    if (
      selectedPitch === undefined ||
      midiTrack
        .getNotes({ pitch: { low: selectedPitch, high: selectedPitch + 1 } })
        .some((note) => note.start === tick)
    ) {
      return;
    }

    midiTrack.addNoteAt({
      tick,
      pitch: selectedPitch,
      velocity: 100,
      duration: 1,
    });
  }
}
