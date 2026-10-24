import type { MidiChannelEvent, MidiNote } from "@openchart/midi";
import {
  addNotePhrase,
  getPhrasePitch,
  type EditablePhraseKind,
  type MidiNotePhrase,
  updateNotePhrase,
} from "@openchart/views";
import type { HighwayContext } from "../context";
import { HighwayCoordinateSystem } from "../coordinates";
import type { HighwayPhraseDragState } from "../types";

export class HighwayPhraseEditingController {
  private readonly context: HighwayContext;
  private readonly coordinates: HighwayCoordinateSystem;
  private dragState: HighwayPhraseDragState | null = null;
  private selectedPhraseNoteOn: MidiChannelEvent | null = null;
  private readonly selectedPhraseNoteOns = new Set<MidiChannelEvent>();

  public constructor(
    context: HighwayContext,
    coordinates: HighwayCoordinateSystem,
  ) {
    this.context = context;
    this.coordinates = coordinates;
  }

  public getDragState(): HighwayPhraseDragState | null {
    return this.dragState;
  }

  public getSelectedPhraseNoteOn(): MidiChannelEvent | null {
    this.getSelectedPhraseNoteOns();
    return this.selectedPhraseNoteOn;
  }

  public getSelectedPhraseNoteOns(): MidiChannelEvent[] {
    const track = this.context.getCurrentChart()?.getTrack().getMidiTrack();
    const existing = new Set(
      track?.getNotes().map((note) => note.noteOn) ?? [],
    );
    for (const noteOn of this.selectedPhraseNoteOns) {
      if (!existing.has(noteOn)) this.selectedPhraseNoteOns.delete(noteOn);
    }
    if (
      this.selectedPhraseNoteOn &&
      !this.selectedPhraseNoteOns.has(this.selectedPhraseNoteOn)
    ) {
      this.selectedPhraseNoteOn =
        [...this.selectedPhraseNoteOns].at(-1) ?? null;
    }
    return [...this.selectedPhraseNoteOns];
  }

  public isPhraseSelected(noteOn: MidiChannelEvent): boolean {
    return this.getSelectedPhraseNoteOns().includes(noteOn);
  }

  public selectPhrase(phrase: MidiNotePhrase | null): void {
    this.selectedPhraseNoteOn = phrase?.note.noteOn ?? null;
    this.selectedPhraseNoteOns.clear();
    if (this.selectedPhraseNoteOn) {
      this.selectedPhraseNoteOns.add(this.selectedPhraseNoteOn);
    }
  }

  public selectPhrases(
    noteOns: Iterable<MidiChannelEvent>,
    additive: boolean,
  ): void {
    if (!additive) this.selectedPhraseNoteOns.clear();
    const incoming = [...noteOns];
    for (const noteOn of incoming) this.selectedPhraseNoteOns.add(noteOn);
    if (incoming.length > 0) {
      this.selectedPhraseNoteOn = incoming[incoming.length - 1] ?? null;
    } else if (!additive) {
      this.selectedPhraseNoteOn = null;
    }
    this.getSelectedPhraseNoteOns();
  }

  public beginPhraseDrag(
    pointerId: number,
    kind: EditablePhraseKind,
    tick: number,
    phrase: MidiNotePhrase | null,
    operation: HighwayPhraseDragState["operation"],
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
      moved: false,
    };
    this.selectPhrase(phrase);
    this.context.beginEdit();
  }

  public updatePhraseDrag(tick: number): void {
    const drag = this.dragState;
    if (!drag) return;
    drag.moved ||= tick !== drag.pointerTick;
    if (drag.operation === "create") {
      drag.startTick = Math.min(drag.pointerTick, tick);
      drag.endTick = Math.max(drag.pointerTick, tick);
    } else if (drag.operation === "move") {
      const start = this.coordinates.snapTick(
        drag.initialStartTick + tick - drag.pointerTick,
      );
      const duration = drag.initialEndTick - drag.initialStartTick;
      drag.startTick = start;
      drag.endTick = start + duration;
    } else if (drag.operation === "resize-start") {
      drag.startTick = Math.min(drag.initialEndTick - 1, Math.max(0, tick));
    } else {
      drag.endTick = Math.max(drag.initialStartTick + 1, tick);
    }
  }

  public finishPhraseDrag(): boolean {
    const drag = this.dragState;
    this.dragState = null;
    if (!drag) return false;
    try {
      const chart = this.context.getCurrentChart();
      if (!chart || (drag.operation === "create" && !drag.moved)) return false;
      const descriptor = chart
        .getSong()
        .getTrackDescriptors()
        .find((item) => item.key === chart.getTrack().getKey());
      const pitch = descriptor ? getPhrasePitch(descriptor, drag.kind) : null;
      if (pitch === null) return false;
      const track = chart.getSong().ensureMidiTrack(chart.getTrack().getKey());
      if (!track) return false;

      const start = Math.max(0, Math.min(drag.startTick, drag.endTick));
      const end = Math.max(drag.startTick, drag.endTick);
      const finalEnd = Math.max(start + 1, end);
      if (!Number.isInteger(start) || !Number.isInteger(finalEnd)) return false;
      let changed = false;
      if (drag.note) {
        changed =
          (start !== drag.initialStartTick ||
            finalEnd !== drag.initialEndTick) &&
          updateNotePhrase(track, drag.note, start, finalEnd);
      } else {
        const phrase = addNotePhrase(track, pitch, drag.kind, start, finalEnd);
        changed = phrase !== null;
        if (phrase) this.selectPhrase(phrase);
      }
      if (changed) this.context.notifyNotesChanged();
      return changed;
    } finally {
      this.context.endEdit();
    }
  }

  public cancelPhraseDrag(): void {
    if (!this.dragState) return;
    this.dragState = null;
    this.context.endEdit();
  }

  public deleteSelectedPhrase(): boolean {
    const chart = this.context.getCurrentChart();
    const track = chart?.getTrack().getMidiTrack();
    const selected = new Set(this.getSelectedPhraseNoteOns());
    const phrases =
      track?.getNotes().filter((note: MidiNote) => selected.has(note.noteOn)) ??
      [];
    this.selectedPhraseNoteOn = null;
    this.selectedPhraseNoteOns.clear();
    if (!track || phrases.length === 0) return false;
    this.context.beginEdit();
    try {
      let changed = false;
      for (const phrase of phrases) {
        changed = track.removeNote(phrase.noteOn, phrase.noteOff) || changed;
      }
      if (changed) this.context.notifyNotesChanged();
      return changed;
    } finally {
      this.context.endEdit();
    }
  }
}
