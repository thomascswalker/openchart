import { expect, test, vi } from "vitest";
import "./mixerTestSetup.js";
import { MixerTrack } from "../track.js";
import { audioInstances } from "./audioMock.js";

test("Track can instantiate", () => {
  const track = new MixerTrack("track1", "sample.wav");
  expect(track).toBeDefined();
});

test("Track loads file", () => {
  const filename = "sample.wav";
  const track = new MixerTrack("track1", filename);
  expect(track.filename).toBe(filename);
  expect(track.id).toBe("track1");
});

test("Track mutes and unmutes, preserving volume", () => {
  const filename = "sample.wav";
  const track = new MixerTrack("track1", filename);
  const initialVolume = track.volume;
  track.muted = true;
  expect(track.muted).toBe(true);
  expect(track.volume).toBe(initialVolume);
  expect(track.effectiveVolume).toBe(0);
  track.muted = false;
  expect(track.muted).toBe(false);
  expect(track.volume).toBe(initialVolume);
  expect(track.effectiveVolume).toBe(initialVolume);
});

test("Track volume scaling is preserved while muted", () => {
  const track = new MixerTrack("track1", "sample.wav");
  track.volumeScale = 0.5;
  track.muted = true;
  expect(track.volume).toBe(1);
  expect(track.effectiveVolume).toBe(0);

  track.volume = 0.4;
  expect(track.volume).toBe(0.4);
  expect(track.effectiveVolume).toBe(0);

  track.muted = false;
  expect(track.volume).toBe(0.4);
  expect(track.effectiveVolume).toBe(0.2);
});

test("Track forwards audio callbacks", () => {
  const track = new MixerTrack("track1", "sample.wav");
  const audio = audioInstances.at(-1)!;
  const callback = vi.fn();

  track.onPlay = callback;
  audio.emit("play", "started");

  expect(callback).toHaveBeenCalledWith({ data: "started" });
});
