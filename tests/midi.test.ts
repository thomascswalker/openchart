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
})