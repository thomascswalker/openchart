import type { MidiNote } from "@openchart/core";

interface TrackerState {
  lastTick: number;
  firstUpdate: boolean;
  crossedNotes: WeakSet<object>;
}

const crossingEpsilon = 1e-6;

/** Tracks note-start crossings independently for each active chart identity. */
export class NoteCrossingTracker {
  private readonly states = new Map<string, TrackerState>();

  public reset(key?: string): void {
    if (key === undefined) this.states.clear();
    else this.states.delete(key);
  }

  public advance(
    key: string,
    tick: number,
    notes: readonly MidiNote[],
  ): MidiNote[] {
    const state = this.states.get(key);
    if (!state || tick < state.lastTick) {
      this.states.set(key, {
        lastTick: tick - crossingEpsilon,
        firstUpdate: true,
        crossedNotes: new WeakSet<object>(),
      });
      return [];
    }

    const crossings = notes.filter((note) => {
      const startsAtCurrentTick = state.firstUpdate && note.start === tick;
      const noteIdentity = note.noteOn;
      const crossing =
        (startsAtCurrentTick ||
          (note.start > state.lastTick && note.start <= tick)) &&
        !state.crossedNotes.has(noteIdentity);
      if (crossing) state.crossedNotes.add(noteIdentity);
      return crossing;
    });

    state.lastTick = tick;
    state.firstUpdate = false;
    return crossings;
  }

  public begin(key: string, tick: number): void {
    this.states.set(key, {
      lastTick: tick - crossingEpsilon,
      firstUpdate: true,
      crossedNotes: new WeakSet<object>(),
    });
  }

  public has(key: string): boolean {
    return this.states.has(key);
  }
}
