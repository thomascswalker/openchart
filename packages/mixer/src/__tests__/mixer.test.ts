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

test("Master volume scales track volumes", () => {
  const mixer = new Mixer();
  mixer.addTrack("track1", "sample.wav");
  mixer.masterVolume = 0.5;

  expect(mixer.masterVolume).toBe(0.5);
  expect(mixer.tracks["track1"].volume).toBe(0.5);

  mixer.tracks["track1"].volume = 0.4;
  expect(mixer.tracks["track1"].volume).toBe(0.2);

  mixer.addTrack("track2", "sample.wav");
  expect(mixer.tracks["track2"].volume).toBe(0.5);

  mixer.masterVolume = 2;
  expect(mixer.tracks["track1"].volume).toBe(0.8);
  expect(mixer.tracks["track2"].volume).toBe(2);
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
  expect(mixer.tracks["track2"].volume).toBe(0);
});

test("Muting a track", () => {
  const mixer = new Mixer();
  mixer.addTrack("track1", "sample.wav");
  mixer.addTrack("track2", "sample.wav");
  mixer.mute("track1");
  expect(mixer.tracks["track1"].muted).toBe(true);
  expect(mixer.tracks["track1"].volume).toBe(0);
  expect(mixer.tracks["track2"].muted).toBe(false);
});

test("Play, pause, and stop tracks", () => {
  const mixer = new Mixer();
  mixer.addTrack("track1", "sample.wav");
  mixer.addTrack("track2", "sample.wav");

  // Play all tracks
  mixer.play();
  expect(mixer.playing).toBe(true);

  // Pause all tracks
  mixer.pause();
  expect(mixer.playing).toBe(false);

  // Stop all tracks
  mixer.stop();
  expect(mixer.playing).toBe(false);
  expect(mixer.currentTime).toEqual(0);
});

test("Seek tracks", () => {
  const mixer = new Mixer();
  mixer.addTrack("track1", "sample.wav");
  mixer.addTrack("track2", "sample.wav");

  const seekTime = 10;
  mixer.seek(seekTime);
  expect(mixer.currentTime).toBe(seekTime);
  expect(mixer.tracks["track1"].currentTime).toBe(seekTime);
  expect(mixer.tracks["track2"].currentTime).toBe(seekTime);
});

test("Duration of tracks", () => {
  const mixer = new Mixer();
  mixer.addTrack("track1", "sample.wav");
  mixer.addTrack("track2", "sample.wav");

  expect(mixer.duration).toBe(0);
});