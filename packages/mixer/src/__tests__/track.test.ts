import { expect, test } from "vitest";
import Track from "../track";

test("Track can instantiate", () => {
  const track = new Track("sample.wav");
  expect(track).toBeDefined();
});

test("Track loads file", () => {
  const filename = "sample.wav";
  const track = new Track(filename);
  expect(track.filename).toBe(filename);
});

test("Track mutes and unmutes, preserving volume", () => {
  const filename = "sample.wav";
  const track = new Track(filename);
  const initialVolume = track.volume;
  track.muted = true;
  expect(track.muted).toBe(true);
  expect(track.volume).toBe(0);
  track.muted = false;
  expect(track.muted).toBe(false);
  expect(track.volume).toBe(initialVolume);
});

test("Track volume scaling is preserved while muted", () => {
  const track = new Track("sample.wav");
  track.volumeScale = 0.5;
  track.muted = true;
  expect(track.volume).toBe(0);

  track.volume = 0.4;
  expect(track.volume).toBe(0);

  track.muted = false;
  expect(track.volume).toBe(0.2);
});
