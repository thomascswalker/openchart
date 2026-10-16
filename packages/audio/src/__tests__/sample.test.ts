import { expect, test, vi, type MockInstance } from "vitest";
import { fileURLToPath } from "node:url";
import AudioSample from "../sample.js";
import { AudioEngine } from "../engine.js";

test("AudioSample loads the sample file", async () => {
  expect(AudioSample).toBeDefined();

  const filename = fileURLToPath(new URL("./sample.wav", import.meta.url));
  const source = await AudioSample.loadAsync(filename);
  expect(source.isValid).toBe(true);
});

test("AudioSample play, pause, and stop methods work", async () => {
  const filename = fileURLToPath(new URL("./sample.wav", import.meta.url));
  const source = await AudioSample.loadAsync(filename);
  expect(source.play()).toBe(true);
  expect(source.play()).toBe(false);
  expect(source.pause()).toBe(true);
  expect(source.stop()).toBe(true);
});

test("AudioSample seeking updates position and restarts a playing source", async () => {
  const filename = fileURLToPath(new URL("./sample.wav", import.meta.url));
  const source = await AudioSample.loadAsync(filename);
  const seekTime = source.duration / 2;
  const context = source.context;
  expect(context).not.toBeNull();
  if (!context) {
    throw new Error("Audio context was not initialized");
  }
  const createBufferSource = vi.spyOn(context, "createBufferSource");

  expect(source.duration).toBeGreaterThan(0);
  expect(source.seek(seekTime)).toBe(true);
  expect(source.currentTime).toBe(seekTime);
  expect(source.play()).toBe(true);
  expect(createBufferSource).toHaveBeenCalledTimes(1);
  expect(source.playing).toBe(true);

  const nextSeekTime = source.duration / 3;
  expect(source.seek(nextSeekTime)).toBe(true);
  expect(createBufferSource).toHaveBeenCalledTimes(2);
  expect(source.playing).toBe(true);
  expect(source.currentTime).toBe(nextSeekTime);

  expect(source.pause()).toBe(true);
  expect(source.playing).toBe(false);
  expect(source.currentTime).toBe(nextSeekTime);
  expect(source.play()).toBe(true);
  expect(createBufferSource).toHaveBeenCalledTimes(3);
  expect(source.currentTime).toBe(nextSeekTime);

  expect(source.stop()).toBe(true);
  expect(source.currentTime).toBe(0);
});

test("AudioSample rejects seek positions outside the buffer", async () => {
  const filename = fileURLToPath(new URL("./sample.wav", import.meta.url));
  const source = await AudioSample.loadAsync(filename);

  expect(source.seek(-1)).toBe(false);
  expect(source.seek(source.duration + 1)).toBe(false);
  expect(source.seek(Number.NaN)).toBe(false);
});

test("AudioSample can be disposed while loading", async () => {
  const filename = fileURLToPath(new URL("./sample.wav", import.meta.url));
  const source = AudioSample.load(filename);

  source.dispose();
  await expect(source.ready).resolves.toBeUndefined();

  expect(source.isValid).toBe(false);
  expect(source.play()).toBe(false);
});

test("AudioSample onLoaded callback is called", async () => {
  const filename = fileURLToPath(new URL("./sample.wav", import.meta.url));
  let loadedCalled = false;
  await AudioSample.loadAsync(filename, {
    onLoaded: () => {
      loadedCalled = true;
    },
  });
  expect(loadedCalled).toBe(true);
});

test("AudioSample reload and reloadAsync methods work", async () => {
  const filename = fileURLToPath(new URL("./sample.wav", import.meta.url));
  const source = await AudioSample.loadAsync(filename);
  source.reload();
  await source.reloadAsync();
  expect(source.isValid).toBe(true);
});

test("AudioSample.play schedules at the requested context time and fades in", async () => {
  const filename = fileURLToPath(new URL("./sample.wav", import.meta.url));
  const sample = await AudioSample.loadAsync(filename);
  const context = sample.context;
  if (!context) {
    throw new Error("Audio context was not initialized");
  }
  const starts: MockInstance[] = [];
  const createBufferSource = context.createBufferSource.bind(context);
  vi.spyOn(context, "createBufferSource").mockImplementation(() => {
    const node = createBufferSource();
    starts.push(vi.spyOn(node, "start"));
    return node;
  });

  const offset = sample.duration / 2;
  expect(sample.play(offset, 42)).toBe(true);

  expect(starts).toHaveLength(1);
  expect(starts[0]).toHaveBeenCalledWith(42, offset);
});

test("AudioSamples sharing an engine share one AudioContext", async () => {
  const filename = fileURLToPath(new URL("./sample.wav", import.meta.url));
  const engine = new AudioEngine();
  const first = await AudioSample.loadAsync(filename, { engine });
  const second = await AudioSample.loadAsync(filename, { engine });

  expect(first.context).toBe(second.context);
  expect(first.engine).toBe(engine);

  // Disposing a sample must not close a context it does not own.
  first.dispose();
  expect(engine.disposed).toBe(false);
  expect(second.context).not.toBeNull();
  engine.dispose();
});

test("AudioSample volume changes are smoothed instead of stepped", async () => {
  const filename = fileURLToPath(new URL("./sample.wav", import.meta.url));
  const sample = await AudioSample.loadAsync(filename);
  expect(sample.play()).toBe(true);
  const context = sample.context;
  if (!context) {
    throw new Error("Audio context was not initialized");
  }
  const smooth = vi.spyOn(sample.engine, "smooth");

  sample.volume = 0.25;

  expect(sample.volume).toBe(0.25);
  expect(smooth).toHaveBeenCalledWith(expect.anything(), 0.25);
});
