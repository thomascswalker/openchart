import type { MidiChannelEvent, MidiNote } from "@midiedit/core";
import { Note, type ChartView } from "@midiedit/views";
import type { HighwayContext } from "./context";
import { laneCount } from "./constants";
import { HighwayCoordinateSystem } from "./coordinates";
import {
  getSustainCutTargets,
  minimumMidiNoteDurationTicks,
} from "./interaction";
import type { HighwayClipboardNote } from "./types";

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
    const firstLane = Math.min(...notes.map((note) => note.note - offset));
    this.clipboard = notes.map((note) => ({
      relativeTick: note.start - firstTick,
      relativeLane: note.note - offset - firstLane,
      durationTicks: note.end - note.start,
      velocity: note.velocity,
    }));
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
    for (const entry of this.clipboard) {
      const lane = anchorLane + entry.relativeLane;
      if (lane < 0 || lane >= laneCount) continue;
      const start = Math.max(
        0,
        this.coordinates.snapTick(snappedAnchorTick + entry.relativeTick),
      );
      chart.addNote(
        lane as Note,
        start,
        start + entry.durationTicks,
        entry.velocity,
      );
      const note = chart
        .getNotes()
        .find(
          (candidate) =>
            !originalNotes.has(candidate.noteOn) &&
            !pasted.has(candidate.noteOn) &&
            candidate.note === lane + chart.getOffset() &&
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
    lane: Note,
    tick: number,
    shiftKey: boolean,
    preferredSustain: MidiNote | null = null,
  ): void {
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
  }

  public cutSustainsAtTick(
    chart: ChartView,
    tick: number,
    shiftKey: boolean,
    preferredSustain: MidiNote | null = null,
    sameLanePlacement = false,
  ): boolean {
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
    return chart.moveNote(note, lane as Note, tick);
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
}
