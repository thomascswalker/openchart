import { Midi } from "./midi.js";
import {expect, test} from 'vitest';

test('is constructed', () => {
    const midi = new Midi();
    expect(midi.header.magic).toBe('MThd');
    expect(midi.header.length).toBe(6);
})