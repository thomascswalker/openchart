import path from "path";
import { Midi } from "../src/midi.js";
import { expect, test } from 'vitest';

test('is constructed', () => {
    const midi = new Midi();
    expect(midi).toBeDefined();
})

test('read file', async () => {
    const { default: testData } = await import('./data.json');

    const currentDir = path.dirname(new URL(import.meta.url).pathname);
    const midiPath = path.join(currentDir, testData.filename);
    const midi = Midi.fromFile(midiPath);

    const header = midi.header;
    expect(header.format).toBe(testData.header.format);
    expect(header.trackCount).toBe(testData.header.trackCount);
    expect(header.division).toBe(testData.header.division);

    expect(midi.tracks).toHaveLength(9);
    expect(midi.tracks.every((t, i) => t.events.length === testData.trackLengths[i])).toBe(true);
    expect(midi.tracks.every((t, i) => t.name === testData.trackNames[i])).toBe(true);
})