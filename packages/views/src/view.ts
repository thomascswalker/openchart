import { ChannelMessage, Midi, MidiTrack, type MidiChannelEvent } from "@midiedit/core";

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

enum Note {
    Green = 0x0,
    Red = 0x1,
    Yellow = 0x2,
    Blue = 0x3,
    Orange = 0x4,
}

class NoteView {
    note: number;
    velocity: number;

    start: number;
    end: number;

    noteOn: MidiChannelEvent;
    noteOff: MidiChannelEvent;

    previous: NoteView | undefined;

    constructor(
        note: number,
        velocity: number,
        start: number,
        end: number,
        noteOn: MidiChannelEvent,
        noteOff: MidiChannelEvent,
        previous: NoteView | undefined,
    ) {
        this.note = note;
        this.velocity = velocity;
        this.start = start;
        this.end = end;
        this.noteOn = noteOn;
        this.noteOff = noteOff;
        this.previous = previous;
    }

    public getLength(): number {
        return this.end - this.start;
    }

    public setStart(value: number) {
        this.start = value;
    }

    public setEnd(value: number) {
        this.end = value;
    }

    public setNote(value: number) {
        this.note = value;
    }
}


class ChartView {
    private track: TrackView;
    private midiTrack: MidiTrack | undefined;
    private difficulty: Difficulty;
    private offset: number;
    private lanes: number;

    constructor(track: TrackView, midiTrack: MidiTrack | undefined, difficulty: Difficulty, offset: number, lanes: number) {
        this.track = track;
        this.midiTrack = midiTrack;
        this.difficulty = difficulty;
        this.offset = offset;
        this.lanes = lanes;
    }

    public getTrack(): TrackView {
        return this.track;
    }

    public getSong(): SongView {
        return this.track.getSong();
    }

    public getDifficulty(): Difficulty {
        return this.difficulty;
    }

    public getNotes(): NoteView[] {
        interface PendingNote {
            note: number;
            velocity: number;
            startTick: number;
            noteOn: MidiChannelEvent;
        }

        const events = this.midiTrack?.getNoteEventsInPitchRange(this.offset, this.offset + this.lanes) || [];
        if (events.length === 0) {
            return [];
        }

        let currentTick = 0;
        const activeNotes = new Map<number, PendingNote[]>();
        const notes: NoteView[] = [];
        let previousNote: NoteView | undefined;

        for (const event of events) {
            currentTick += event.deltaTime;

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
                    startTick: currentTick,
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

                const newNote = new NoteView(
                    pending.note,
                    pending.velocity,
                    pending.startTick,
                    currentTick,
                    pending.noteOn,
                    event,
                    previousNote,
                );
                notes.push(newNote);

                // Store the previous note which is not the same tick position
                // as this current note.
                if (previousNote && previousNote.start !== newNote.start) {
                    previousNote = newNote;
                }

                if (notesForPitch.length === 0) {
                    activeNotes.delete(noteNumber);
                }
            }
        }
        notes.sort((a, b) => a.start - b.start);
        return notes;
    }

    public addNote(note: Note, start: number, end: number = 0): void {
        if (!this.midiTrack || !Number.isInteger(start) ||
            !Number.isInteger(end) || start < 0 || end <= start ||
            note < 0 || note >= this.lanes) {
            return;
        }

        const pitch = this.offset + note;
        const insertAt = this.midiTrack.getInsertionIndexAt(start);
        const previousTick = this.midiTrack.getAbsoluteTickAt(insertAt);
        const startDelta = start - previousTick;

        this.midiTrack.addNote(
            pitch,
            startDelta,
            100,
            (end > 0 ? end : 240) - start,
            insertAt,
        );
    }

    public removeNote(note: NoteView): boolean {
        if (!this.midiTrack ||
            note.note < this.offset ||
            note.note >= this.offset + this.lanes) {
            return false;
        }

        return this.midiTrack.removeNote(note.noteOn, note.noteOff);
    }
}

class TrackView {
    private song: SongView;
    private track: MidiTrack | undefined;
    private validator: (track: MidiTrack) => boolean;

    private expert: ChartView;
    private hard: ChartView;
    private medium: ChartView;
    private easy: ChartView;

    constructor(
        song: SongView,
        midiTrack: MidiTrack | undefined,
        validator: ((midiTrack: MidiTrack) => boolean) = () => { return true }
    ) {
        this.song = song;
        this.track = midiTrack;
        this.validator = validator;

        this.expert = new ChartView(this, this.track, Difficulty.Expert, EXPERT_OFFSET, GUITAR_NOTE_COUNT);
        this.hard = new ChartView(this, this.track, Difficulty.Hard, HARD_OFFSET, GUITAR_NOTE_COUNT);
        this.medium = new ChartView(this, this.track, Difficulty.Medium, MEDIUM_OFFSET, GUITAR_NOTE_COUNT);
        this.easy = new ChartView(this, this.track, Difficulty.Easy, EASY_OFFSET, GUITAR_NOTE_COUNT);
    }

    public isValid(): boolean {
        if (typeof this.track === "undefined") {
            return false;
        }
        return this.validator(this.track);
    }

    public getSong(): SongView {
        return this.song;
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
        this.lead = new TrackView(this, this.midi.getTrack(Instrument.Lead));
        this.groove = new TrackView(this, this.midi.getTrack(Instrument.Groove));
        this.drums = new TrackView(this, this.midi.getTrack(Instrument.Drums));
        this.vocals = new TrackView(this, this.midi.getTrack(Instrument.Vocals));
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

export { SongView, Instrument, Difficulty, Note };