import path from "path";
import { Midi } from "../src/midi.js";
import { expect, test } from 'vitest';
import { SongView, Instrument, Difficulty } from "../src/view.js";


test('is constructed', async () => {
    const { default: testData } = await import('./data.json');

    const currentDir = path.dirname(new URL(import.meta.url).pathname);
    const midiPath = path.join(currentDir, testData.filename);
    const midi = Midi.fromFile(midiPath);
    expect(midi).toBeDefined();

    const song = new SongView(midi);

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
