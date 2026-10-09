import { expect, test, vi } from "vitest";
import Mixer from "../mixer";
import { audioInstances } from "./audioMock";

test("Mixer reports changes from operations", () => {
  const mixer = new Mixer();
  const onChange = vi.fn();
  mixer.onChange = onChange;

  mixer.addTrack("track1", "sample.wav");
  mixer.masterVolume = 0.5;
  mixer.mute("track1");
  mixer.solo("track1");
  mixer.seek(1);
  mixer.seekStart();
  mixer.seekEnd();
  mixer.play();
  mixer.pause();
  mixer.stop();
  mixer.removeTrack("track1");

  expect(onChange).toHaveBeenCalledTimes(14);
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
