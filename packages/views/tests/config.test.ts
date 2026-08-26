import { expect, test } from 'vitest';
import { loadConfigFromFile } from '../src/config.js';

test('load config from file', async () => {
    const config = loadConfigFromFile();
    expect(config).toBeDefined();
});