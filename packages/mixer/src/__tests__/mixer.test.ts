import { expect, test } from "vitest";
import Mixer from "../mixer";

test("Mixer can instantiate", () => {
  const mixer = new Mixer();
  expect(mixer).toBeDefined();
});

test("Adding/removing tracks", () => {
  const mixer = new Mixer();
  mixer.addTrack("track1", "sample.wav");
  expect(mixer.tracks).toHaveProperty("track1");
  mixer.removeTrack("track1");
  expect(mixer.tracks).not.toHaveProperty("track1");
});

test("Soloing a track", () => {
  const mixer = new Mixer();
  mixer.addTrack("track1", "sample.wav");
  mixer.addTrack("track2", "sample.wav");
  // Force track2 to be unmuted
  mixer.tracks["track2"].muted = false;
  // Solo track1
  mixer.solo("track1");
  // Check that track1 is unmuted and track2 is muted after soloing
  expect(mixer.tracks["track1"].muted).toBe(false);
  expect(mixer.tracks["track2"].muted).toBe(true);
});

test("Muting a track", () => {
  const mixer = new Mixer();
  mixer.addTrack("track1", "sample.wav");
  mixer.addTrack("track2", "sample.wav");
  mixer.mute("track1");
  expect(mixer.tracks["track1"].muted).toBe(true);
  expect(mixer.tracks["track2"].muted).toBe(false);
});
