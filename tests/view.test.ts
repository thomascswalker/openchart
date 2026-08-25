import path from "path";
import { Midi } from "../src/midi.js";
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
        console.log(lead);
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

    it('mutate notes', async () => {
        const lead = song.getInstrumentView(Instrument.Lead);
        const chart = lead.getChart(Difficulty.Expert);
        console.log(chart.getNotes().length);
        chart.addNote(Note.Green, 0, 100);
        console.log(chart.getNotes().length);
    })
})
