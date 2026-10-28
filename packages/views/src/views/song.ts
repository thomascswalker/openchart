import { MetaType, Midi, MidiTrack } from "@openchart/midi";
import {
  DefaultCompiledRuleset,
  type CompiledRuleset,
  type TrackDescriptor,
  type TrackRules,
} from "../ruleset/compile.js";
import { GlobalTrackView } from "./global.js";
import { InstrumentTrackView } from "./instrument.js";
import type { TrackView } from "./track.js";
import { VocalTrackView } from "./vocal.js";

class SongView {
  private midi: Midi;
  private rules: CompiledRuleset;
  private views!: Map<string, TrackView>;

  constructor(midi: Midi, rules: CompiledRuleset = DefaultCompiledRuleset) {
    this.midi = midi;
    this.rules = rules;
    this.build();
  }

  public getRuleset(): CompiledRuleset {
    return this.rules;
  }

  /** (Re)build the track views from the compiled ruleset. */
  public build(): void {
    this.views = new Map();
    for (const rules of this.rules.tracks) {
      const midiTrack = this.midi.getTrack(rules.name);
      this.views.set(rules.key, this.createView(rules, midiTrack));
    }
  }

  private createView(
    rules: TrackRules,
    midiTrack: MidiTrack | undefined,
  ): TrackView {
    switch (rules.kind) {
      case "header":
      case "global":
        return new GlobalTrackView(this, midiTrack, rules);
      case "vocals":
        return new VocalTrackView(this, midiTrack, rules);
      case "guitar":
      case "drums":
      case "gamepad":
        return new InstrumentTrackView(this, midiTrack, rules);
    }
  }

  public getTrackDescriptors(): readonly TrackDescriptor[] {
    return this.rules.descriptors();
  }

  public getVisibleTrackDescriptors(): readonly TrackDescriptor[] {
    return this.getTrackDescriptors().filter(
      (descriptor) => descriptor.visible && descriptor.kind !== "header",
    );
  }

  /** The view for a track key or MIDI track name. */
  public getTrackView(keyOrName: string): TrackView | undefined {
    const byKey = this.views.get(keyOrName);
    if (byKey) return byKey;
    return [...this.views.values()].find((v) => v.getName() === keyOrName);
  }

  public getInstrumentTrackView(
    keyOrName: string,
  ): InstrumentTrackView | undefined {
    const view = this.getTrackView(keyOrName);
    return view instanceof InstrumentTrackView ? view : undefined;
  }

  public getInstrumentTrackViews(): readonly InstrumentTrackView[] {
    return [...this.views.values()].filter(
      (v): v is InstrumentTrackView => v instanceof InstrumentTrackView,
    );
  }

  /** The named vocal track, or the first configured one when omitted. */
  public getVocalTrackView(keyOrName?: string): VocalTrackView | undefined {
    const views = this.getVocalTrackViews();
    return keyOrName === undefined
      ? views[0]
      : views.find(
          (view) => view.getName() === keyOrName || view.getKey() === keyOrName,
        );
  }

  public getVocalTrackViews(): readonly VocalTrackView[] {
    return [...this.views.values()].filter(
      (v): v is VocalTrackView => v instanceof VocalTrackView,
    );
  }

  public attachTrack(track: MidiTrack): void {
    if (!this.midi.tracks.includes(track)) {
      this.midi.tracks.push(track);
    }
  }

  public getMidiTrack(
    keyOrDescriptor: string | TrackDescriptor,
  ): MidiTrack | undefined {
    const key =
      typeof keyOrDescriptor === "string"
        ? keyOrDescriptor
        : keyOrDescriptor.key;
    const rules = this.rules.byKey.get(key);
    return rules ? this.midi.getTrack(rules.name) : undefined;
  }

  /** Materialize a configured track only for an intentional edit. */
  public ensureMidiTrack(key: string): MidiTrack | undefined {
    const rules = this.rules.byKey.get(key);
    if (!rules || rules.kind === "header") return undefined;
    const existing = this.midi.getTrack(rules.name);
    if (existing) return existing;

    const track = new MidiTrack(rules.name);
    track.format = this.midi.header.format;
    // Without a TrackName event the track would save to .mid unnamed and no
    // longer map to its configured track on reload. The ruleset says where
    // that event must sit (`midi.trackNameEvent`); tick 0 satisfies both
    // `mustBeFirstEvent` and `mustBeAtTickZero` because the track is new.
    track.addTextEvent(MetaType.TrackName, 0, rules.name);
    this.insertAtPosition(track, rules.position);
    this.midi.header.trackCount = this.midi.tracks.length;
    this.build();
    return this.midi.getTrack(rules.name);
  }

  /** Honour a rule's required `position` when the file is long enough. */
  private insertAtPosition(track: MidiTrack, position: number | undefined) {
    if (position !== undefined && position <= this.midi.tracks.length) {
      this.midi.tracks.splice(position, 0, track);
    } else {
      this.midi.tracks.push(track);
    }
  }

  public getUnmappedMidiTracks(): readonly MidiTrack[] {
    return this.midi.tracks.filter(
      (track) => !this.rules.byName.has(track.name),
    );
  }
}

export { SongView };
