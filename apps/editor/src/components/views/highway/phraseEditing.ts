import type { MidiChannelEvent, MidiNote } from "@midiedit/core";
import {
  addNotePhrase,
  getPhrasePitch,
  type EditablePhraseKind,
  type MidiNotePhrase,
  updateNotePhrase,
} from "@midiedit/views";
import type { HighwayContext } from "./context";
import { HighwayCoordinateSystem } from "./coordinates";
import type { PhraseDragState } from "./types";

export class HighwayPhraseEditingController {
  private readonly context: HighwayContext;
  private readonly coordinates: HighwayCoordinateSystem;
  private dragState: PhraseDragState | null = null;
  private selectedPhraseNoteOn: MidiChannelEvent | null = null;

  public constructor(
    context: HighwayContext,
    coordinates: HighwayCoordinateSystem,
  ) {
    this.context = context;
    this.coordinates = coordinates;
  }

  public getDragState(): PhraseDragState | null {
    return this.dragState;
  }

  public getSelectedPhraseNoteOn(): MidiChannelEvent | null {
    return this.selectedPhraseNoteOn;
  }

  public setSelectedPhraseNoteOn(noteOn: MidiChannelEvent | null): void {
    this.selectedPhraseNoteOn = noteOn;
  }

  public beginPhraseDrag(
    pointerId: number,
    kind: EditablePhraseKind,
    tick: number,
    phrase: MidiNotePhrase | null,
    operation: PhraseDragState["operation"],
  ): void {
    this.dragState = {
      pointerId,
      kind,
      startTick: phrase?.start ?? tick,
      endTick: phrase?.end ?? tick,
      pointerTick: tick,
      initialStartTick: phrase?.start ?? tick,
      initialEndTick: phrase?.end ?? tick,
      operation,
      note: phrase?.note ?? null,
    };
    this.selectedPhraseNoteOn = phrase?.note.noteOn ?? null;
  }

  public updatePhraseDrag(tick: number): void {
    const drag = this.dragState;
    if (!drag) return;
    if (drag.operation === "create") {
      drag.endTick = tick;
    } else if (drag.operation === "move") {
      const start = this.coordinates.snapTick(
        drag.initialStartTick + tick - drag.pointerTick,
      );
      const duration = drag.initialEndTick - drag.initialStartTick;
      drag.startTick = start;
      drag.endTick = start + duration;
    } else if (drag.operation === "resize-start") {
      drag.startTick = Math.min(drag.initialEndTick - 1, tick);
    } else {
      drag.endTick = Math.max(drag.initialStartTick + 1, tick);
    }
  }

  public finishPhraseDrag(): boolean {
    const drag = this.dragState;
    this.dragState = null;
    const chart = this.context.getCurrentChart();
    if (!drag || !chart) return false;
    const descriptor = chart
      .getSong()
      .getTrackDescriptors()
      .find((item) => item.key === chart.getTrack().getKey());
    const pitch = descriptor ? getPhrasePitch(descriptor, drag.kind) : null;
    if (pitch === null) return false;
    const track = chart.getSong().ensureMidiTrack(chart.getTrack().getKey());
    if (!track) return false;

    const start = Math.min(drag.startTick, drag.endTick);
    const end = Math.max(drag.startTick, drag.endTick);
    const finalEnd = Math.max(start + 1, end);
    const changed = drag.note
      ? (start !== drag.initialStartTick || finalEnd !== drag.initialEndTick) &&
        updateNotePhrase(track, drag.note, start, finalEnd)
      : addNotePhrase(track, pitch, drag.kind, start, finalEnd) !== null;
    if (changed) this.context.notifyNotesChanged();
    return changed;
  }

  public cancelPhraseDrag(): void {
    this.dragState = null;
  }

  public deleteSelectedPhrase(): boolean {
    const chart = this.context.getCurrentChart();
    const selectedPhraseNoteOn = this.selectedPhraseNoteOn;
    const track = chart?.getTrack().getMidiTrack();
    const phrase = track
      ?.getNotes()
      .find((note: MidiNote) => note.noteOn === selectedPhraseNoteOn);
    const changed =
      phrase && track ? track.removeNote(phrase.noteOn, phrase.noteOff) : false;
    this.selectedPhraseNoteOn = null;
    if (changed) this.context.notifyNotesChanged();
    return changed;
  }
}
