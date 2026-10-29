import { expect, test, vi } from "vitest";
import "./mixerTestSetup.js";
import { Mixer } from "../mixer.js";
import { audioInstances } from "./audioMock.js";

test("Mixer reports changes from operations", () => {
  const mixer = new Mixer();
  const onChange = vi.fn();
  mixer.onChange = onChange;

  mixer.addTrack("track1", "sample.wav");
  mixer.masterVolume = 0.5;
  mixer.setTrackVolume(mixer.tracks["track1"], 0.75);
  mixer.toggleMasterMute();
  mixer.toggleMute(mixer.tracks["track1"]);
  mixer.toggleSolo(mixer.tracks["track1"]);
  mixer.seek(1);
  mixer.seekStart();
  mixer.seekEnd();
  mixer.play();
  mixer.pause();
  mixer.stop();
  mixer.removeTrack("track1");

  expect(onChange).toHaveBeenCalledTimes(16);
});

test("Mixer sets volume for its own tracks and ignores unowned tracks", () => {
  const mixer = new Mixer();
  const onChange = vi.fn();
  mixer.onChange = onChange;
  mixer.addTrack("track1", "sample.wav");
  mixer.addTrack("track2", "sample.wav");
  onChange.mockClear();
  const track1 = mixer.tracks["track1"];

  mixer.setTrackVolume(track1, 0.4);

  expect(track1.volume).toBe(0.4);
  expect(onChange).toHaveBeenCalledOnce();

  mixer.removeTrack("track1");
  onChange.mockClear();
  mixer.setTrackVolume(track1, 0.8);

  expect(mixer.tracks["track2"].volume).toBe(1);
  expect(onChange).not.toHaveBeenCalled();
});

test("Mixer reports changes from audio events", () => {
  const mixer = new Mixer();
  const onChange = vi.fn();
  mixer.onChange = onChange;
  mixer.addTrack("track1", "sample.wav");
  onChange.mockClear();
  const audio = audioInstances.at(-1)!;

  audio.emit("loaded", null);
  audio.play();
  audio.emit("ended", null);

  expect(onChange).toHaveBeenCalledTimes(3);
});
