import path from "path";
import { ChannelMessage, Midi, MidiTrack } from "@midiedit/core";
import { expect, test, describe, beforeAll, it } from 'vitest';
import { SongView, Instrument, Difficulty, Note } from "../src/view.js";


describe('data.json', () => {
    let midi: Midi;
    let song: SongView;

    beforeAll(async () => {
        const { default: testData } = await import('./data.json');

        const currentDir = path.dirname(new URL(import.meta.url).pathname);
        const midiPath = path.join(currentDir, testData.filename);
        midi = Midi.fromFile(midiPath);
        expect(midi).toBeDefined();

        song = new SongView(midi);
    })

    it('instrument parsing', async () => {
        const lead = song.getInstrumentView(Instrument.Lead);
        expect(lead).toBeDefined();
        expect(song.getInstrumentView(Instrument.Groove)).toBeDefined();
        expect(song.getInstrumentView(Instrument.Drums)).toBeDefined();
        expect(song.getInstrumentView(Instrument.Vocals)).toBeDefined();

        const noteCounts = [
            1954, // Expert
            1425, // Hard
            980, // Medium
            661, // Easy
        ];
        lead.getCharts().forEach((chart, index) => {
            const notes = chart.getNotes();
            expect(notes.length).toBe(noteCounts[index]);
        })
    })

    it('mutates both the ChartView and its underlying MidiTrack', () => {
        const midi = new Midi();
        const track = new MidiTrack();
        track.name = Instrument.Lead;
        midi.tracks = [track];

        const chart = new SongView(midi)
            .getInstrumentView(Instrument.Lead)
            .getChart(Difficulty.Expert);

        chart.addNote(Note.Green, 480, 720);

        const events = track.getChannelEvents();
        expect(events).toHaveLength(2);
        expect(events.map((event) => event.deltaTime)).toEqual([480, 240]);
        expect(events[0]?.status).toBe(0x90);
        expect(events[1]?.status).toBe(0x80);
        expect(events[0]?.messageType).toBe(ChannelMessage.NoteOn);
        expect(events[1]?.messageType).toBe(ChannelMessage.NoteOff);
        expect(events[0]?.data1).toBe(96); // Expert offset + Green lane
        expect(events[1]?.data1).toBe(96);

        const notes = chart.getNotes();
        expect(notes).toHaveLength(1);
        expect(notes[0]?.start).toBe(480);
        expect(notes[0]?.end).toBe(720);
        expect(midi.getTrack(Instrument.Lead)?.events).toBe(track.events);

        expect(chart.removeNote(notes[0])).toBe(true);
        expect(track.events).toHaveLength(0);
        expect(chart.getNotes()).toHaveLength(0);
    });

    it('keeps MidiTrack relative timing and ChartView absolute timing separate', () => {
        const midi = new Midi();
        const track = new MidiTrack();
        track.name = Instrument.Lead;
        midi.tracks = [track];

        track.addNote(97, 0, 100, 960);
        track.addNote(98, 240, 100, 240);

        const chart = new SongView(midi)
            .getInstrumentView(Instrument.Lead)
            .getChart(Difficulty.Expert);

        chart.addNote(Note.Green, 480, 720);

        expect(track.events.map((event) => event.deltaTime)).toEqual([0, 480, 240, 240, 240, 240]);
        expect(chart.getNotes().map((note) => [note.note, note.start, note.end])).toEqual([
            [97, 0, 960],
            [96, 480, 720],
            [98, 1200, 1440],
        ]);

        const added = chart.getNotes().find((note) => note.note === 96)!;
        expect(chart.removeNote(added)).toBe(true);
        expect(track.events.map((event) => event.deltaTime)).toEqual([0, 960, 240, 240]);
        expect(chart.getNotes().map((note) => [note.note, note.start, note.end])).toEqual([
            [97, 0, 960],
            [98, 1200, 1440],
        ]);
    })
})
