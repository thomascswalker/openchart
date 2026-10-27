import { MidiTrack, MidiNote } from "@openchart/midi";

export class NoteCache {
  #midiTrack: MidiTrack | undefined;
  #revision = -1;
  #notes: MidiNote[] = [];

  constructor(midiTrack: MidiTrack | undefined) {
    this.#midiTrack = midiTrack;
  }

  public update() {
    if (!this.#midiTrack) {
      return (this.#notes = []);
    }
    const revision = this.#midiTrack.getNoteRevision();
    if (this.#midiTrack === this.#midiTrack && this.#revision === revision) {
      return;
    }

    this.#notes = this.#midiTrack.getNotes() ?? [];
    this.#revision = revision;
  }

  public getNotes(): MidiNote[] {
    return this.#notes;
  }
}
