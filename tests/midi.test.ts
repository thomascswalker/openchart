import { Midi } from "../src/midi.js";
import { expect, test } from 'vitest';
import fs from 'fs/promises';
import path from 'path';

test('is constructed', () => {
    const midi = new Midi();
    expect(midi).toBeDefined();
})

test('read file', async () => {
    const currentDir = path.dirname(new URL(import.meta.url).pathname);
    const midiPath = path.join(currentDir, 'song.mid');
    const data = await fs.readFile(midiPath);
    const midi = new Midi(data);

    const header = midi.header;
    expect(header.format).toBe(1);
    expect(header.trackCount).toBe(9);
    expect(header.division).toBe(480);

    const lengths = [213, 4, 12147, 8719, 16028, 1680, 10279, 10697, 2116];
    const names = ["notes", "CHART HEADER", "LEAD GUITAR", "RHYTHM GUITAR", "DRUMS", "VOCALS", "FOUR PAD", "FIVE PAD", "GLOBAL"];
    expect(midi.tracks).toHaveLength(9);
    expect(midi.tracks.every((t, i) => {
        return t.events.length === lengths[i] && t.name === names[i];
    })).toBe(true);
})