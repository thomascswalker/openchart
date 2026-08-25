import { ChannelMessage, Midi, MidiTrack, type MidiChannelEvent } from "./midi.js";

const OCTAVE = 12;

const EASY_OFFSET = OCTAVE * 5;
const MEDIUM_OFFSET = OCTAVE * 6;
const HARD_OFFSET = OCTAVE * 7;
const EXPERT_OFFSET = OCTAVE * 8;

const GUITAR_NOTE_COUNT = 5;
const DRUMS_NOTE_COUNT = 9;

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

class Note {
    note: number;
    velocity: number;

    start: number;
    end: number;

    noteOn: MidiChannelEvent;
    noteOff: MidiChannelEvent;

    constructor(
        note: number,
        velocity: number,
        start: number,
        end: number,
        noteOn: MidiChannelEvent,
        noteOff: MidiChannelEvent,
    ) {
        this.note = note;
        this.velocity = velocity;
        this.start = start;
        this.end = end;
        this.noteOn = noteOn;
        this.noteOff = noteOff;
    }

    public getLength(): number {
        return this.end - this.start;
    }
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

    public getDifficulty(): Difficulty {
        return this.difficulty;
    }

    public getNotes(): Note[] {
        interface PendingNote {
            note: number;
            velocity: number;
            startTick: number;
            noteOn: MidiChannelEvent;
        }

        const events = this.track?.getNotesInPitchRange(this.offset, this.offset + this.lanes) || [];
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
                notes.push(new Note(
                    pending.note,
                    pending.velocity,
                    pending.startTick,
                    absoluteTick,
                    pending.noteOn,
                    event,
                ));

                if (notesForPitch.length === 0) {
                    activeNotes.delete(noteNumber);
                }
            }
        }
        notes.sort((a, b) => a.start - b.start);
        return notes;
    }
}

class TrackView {
    private track: MidiTrack | undefined;
    private validator: (track: MidiTrack) => boolean;

    private expert: ChartView;
    private hard: ChartView;
    private medium: ChartView;
    private easy: ChartView;

    constructor(
        track: MidiTrack | undefined,
        validator: ((track: MidiTrack) => boolean) = () => { return true }
    ) {
        this.track = track;
        this.validator = validator;

        this.expert = new ChartView(this.track, Difficulty.Expert, EXPERT_OFFSET, GUITAR_NOTE_COUNT);
        this.hard = new ChartView(this.track, Difficulty.Hard, HARD_OFFSET, GUITAR_NOTE_COUNT);
        this.medium = new ChartView(this.track, Difficulty.Medium, MEDIUM_OFFSET, GUITAR_NOTE_COUNT);
        this.easy = new ChartView(this.track, Difficulty.Easy, EASY_OFFSET, GUITAR_NOTE_COUNT);
    }

    public isValid(): boolean {
        if (typeof this.track === "undefined") {
            return false;
        }
        return this.validator(this.track);
    }

    public getChart(difficulty: Difficulty) {
        switch (difficulty) {
            case Difficulty.Expert: return this.expert;
            case Difficulty.Hard: return this.hard;
            case Difficulty.Medium: return this.medium;
            case Difficulty.Easy: return this.easy;
        }
    }

    public getCharts(): ChartView[] { return [this.expert, this.hard, this.medium, this.easy]; }
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