import path from "path";
import { Midi } from "../src/midi.js";
import { expect, test } from 'vitest';
import { SongView, Instrument } from "../src/view.js";


test('is constructed', async () => {
    const { default: testData } = await import('./data.json');

    const currentDir = path.dirname(new URL(import.meta.url).pathname);
    const midiPath = path.join(currentDir, testData.filename);
    const midi = Midi.fromFile(midiPath);
    expect(midi).toBeDefined();

    const view = new SongView(midi);
    expect(view.getInstrumentView(Instrument.Lead)).toBeDefined();
    expect(view.getInstrumentView(Instrument.Groove)).toBeDefined();
    expect(view.getInstrumentView(Instrument.Drums)).toBeDefined();
    expect(view.getInstrumentView(Instrument.Vocals)).toBeDefined();
})
