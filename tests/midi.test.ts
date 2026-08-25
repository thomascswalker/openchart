import { Midi } from "../src/midi.js";
import { expect, test } from 'vitest';
import fs from 'fs/promises';
import path from 'path';


test('is constructed', () => {
    const midi = new Midi();
    expect(midi).toBeDefined();
})

test('read file', async () => {
    const { default: testData } = await import('./data.json');
    const currentDir = path.dirname(new URL(import.meta.url).pathname);
    const midiPath = path.join(currentDir, testData.filename);
    const data = await fs.readFile(midiPath);
    const midi = new Midi(data);

    const header = midi.header;
    expect(header.format).toBe(testData.header.format);
    expect(header.trackCount).toBe(testData.header.trackCount);
    expect(header.division).toBe(testData.header.division);

    expect(midi.tracks).toHaveLength(9);
    expect(midi.tracks.every((t, i) => t.events.length === testData.trackLengths[i])).toBe(true);
    expect(midi.tracks.every((t, i) => t.name === testData.trackNames[i])).toBe(true);
})