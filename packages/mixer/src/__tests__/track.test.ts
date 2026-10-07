import { expect, test } from "vitest";
import Track from "../track";

test("Track should be defined", () => {
  expect(Track).toBeDefined();
});

test("Track loads file", () => {
  const filename = "sample.wav";
  const track = new Track(filename);
  expect(track.filename).toBe(filename);
});

test("Track mutes and unmutes, preserving volume", () => {
  const filename = "sample.wav";
  const track = new Track(filename);
  const initialVolume = track["audio"].volume;
  track.muted = true;
  expect(track.muted).toBe(true);
  expect(track["audio"].volume).toBe(0);
  track.muted = false;
  expect(track.muted).toBe(false);
  expect(track["audio"].volume).toBe(initialVolume);
});
