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

    const view = new SongView(midi);

    const lead = view.getInstrumentView(Instrument.Lead);
    console.log(lead);
    expect(lead).toBeDefined();
    expect(view.getInstrumentView(Instrument.Groove)).toBeDefined();
    expect(view.getInstrumentView(Instrument.Drums)).toBeDefined();
    expect(view.getInstrumentView(Instrument.Vocals)).toBeDefined();

    const expert = lead.getDifficulty(Difficulty.Expert);
    const hard = lead.getDifficulty(Difficulty.Hard);
    const medium = lead.getDifficulty(Difficulty.Medium);
    const easy = lead.getDifficulty(Difficulty.Easy);

    const noteCounts = [1954, 1425, 980, 661];
    const diffs = [expert, hard, medium, easy];
    diffs.forEach((view, index) => {
        const notes = view.getNotes();
        expect(notes.length).toBe(noteCounts[index]);
    })
})
