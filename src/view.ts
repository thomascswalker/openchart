import { ChannelMessage, Midi, MidiTrack, type MidiChannelEvent } from "./midi.js";

enum Instrument {
    Lead = "LEAD GUITAR",
    Groove = "RHYTHM GUITAR",
    Drums = "DRUMS",
    Vocals = "VOCALS"
}

enum Difficulty {
    Easy,
    Medium,
    Hard,
    Expert
}

export interface Note {
    channel: number;
    note: number;
    velocity: number;

    startTick: number;
    endTick: number;
    durationTicks: number;

    noteOn: MidiChannelEvent;
    noteOff: MidiChannelEvent;
}


class ChartView {
    private track: MidiTrack | undefined;
    private difficulty: Difficulty;
    private offset: number;
    private lanes: number;

    constructor(track: MidiTrack | undefined, difficulty: Difficulty, offset: number, lanes: number) {
        this.track = track;
        this.difficulty = difficulty;
        this.offset = offset;
        this.lanes = lanes;
    }

    public getNotes(): Note[] {
        interface PendingNote {
            note: number;
            velocity: number;
            startTick: number;
            noteOn: MidiChannelEvent;
        }

        const events = this.track?.getNotesInRange(this.offset, this.offset + this.lanes) || [];
        if (events.length === 0) {
            return [];
        }

        let absoluteTick = 0;
        const activeNotes = new Map<number, PendingNote[]>();
        const notes: Note[] = [];
        for (const event of events) {
            absoluteTick += event.deltaTime;

            const noteNumber = event.data1;
            const velocity = event.data2 ?? 0;

            const isNoteOn =
                event.messageType === ChannelMessage.NoteOn &&
                velocity > 0;

            const isNoteOff =
                event.messageType === ChannelMessage.NoteOff ||
                (
                    event.messageType === ChannelMessage.NoteOn &&
                    velocity === 0
                );

            if (isNoteOn) {
                const pending: PendingNote = {
                    note: noteNumber,
                    velocity,
                    startTick: absoluteTick,
                    noteOn: event,
                };

                const notesForPitch = activeNotes.get(noteNumber) ?? [];
                notesForPitch.push(pending);
                activeNotes.set(noteNumber, notesForPitch);

                continue;
            }

            if (isNoteOff) {
                const notesForPitch = activeNotes.get(noteNumber);

                if (!notesForPitch || notesForPitch.length === 0) {
                    console.error(`Unmatched NoteOff event: ${notesForPitch}`);
                    continue;
                }

                const pending = notesForPitch.shift()!;
                notes.push({
                    note: pending.note,
                    velocity: pending.velocity,
                    startTick: pending.startTick,
                    endTick: absoluteTick,
                    durationTicks: absoluteTick - pending.startTick,
                    noteOn: pending.noteOn,
                    noteOff: event,
                } as Note);

                if (notesForPitch.length === 0) {
                    activeNotes.delete(noteNumber);
                }
            }
        }
        notes.sort((a, b) => a.startTick - b.startTick);
        return notes;
    }
}

class TrackView {
    private track: MidiTrack | undefined;
    private validator: (track: MidiTrack) => boolean;

    private easy: ChartView;
    private medium: ChartView;
    private hard: ChartView;
    private expert: ChartView;

    constructor(
        track: MidiTrack | undefined,
        validator: ((track: MidiTrack) => boolean) = () => { return true }
    ) {
        this.track = track;
        this.validator = validator;

        this.easy = new ChartView(this.track, Difficulty.Easy, 60, 5);
        this.medium = new ChartView(this.track, Difficulty.Medium, 72, 5);
        this.hard = new ChartView(this.track, Difficulty.Hard, 84, 5);
        this.expert = new ChartView(this.track, Difficulty.Expert, 96, 5);
    }

    public isValid(): boolean {
        if (typeof this.track === "undefined") {
            return false;
        }
        return this.validator(this.track);
    }

    public getDifficulty(difficulty: Difficulty) {
        switch (difficulty) {
            case Difficulty.Easy: return this.easy;
            case Difficulty.Medium: return this.medium;
            case Difficulty.Hard: return this.hard;
            case Difficulty.Expert: return this.expert;
        }
    }
}

class SongView {
    private midi: Midi;

    private lead!: TrackView;
    private groove!: TrackView;
    private drums!: TrackView;
    private vocals!: TrackView;

    constructor(midi: Midi) {
        this.midi = midi;
        this.sync();
    }

    public sync(): void {
        this.lead = new TrackView(this.midi.getTrack(Instrument.Lead));
        this.groove = new TrackView(this.midi.getTrack(Instrument.Groove));
        this.drums = new TrackView(this.midi.getTrack(Instrument.Drums));
        this.vocals = new TrackView(this.midi.getTrack(Instrument.Vocals));
    }

    public getInstrumentView(instrument: Instrument): TrackView {
        switch (instrument) {
            case Instrument.Lead: return this.lead;
            case Instrument.Groove: return this.groove;
            case Instrument.Drums: return this.drums;
            case Instrument.Vocals: return this.vocals;
        }
    }
}

export { SongView, Instrument, Difficulty };