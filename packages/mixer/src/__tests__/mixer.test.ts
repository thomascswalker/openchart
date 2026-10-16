import { expect, test, vi } from "vitest";
import Mixer from "../mixer";
import { audioInstances } from "./audioMock";

test("Mixer can instantiate", () => {
  const mixer = new Mixer();
  expect(mixer).toBeDefined();
});

test("Adding/removing tracks", () => {
  const mixer = new Mixer();
  mixer.addTrack("track1", "sample.wav");
  expect(mixer.tracks).toHaveProperty("track1");
  expect(mixer.tracks["track1"].id).toBe("track1");
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

test("Solo toggles a track and restores mute states when cleared", () => {
  const mixer = new Mixer();
  mixer.addTrack("track1", "sample.wav");
  mixer.addTrack("track2", "sample.wav");
  mixer.addTrack("track3", "sample.wav");
  mixer.tracks["track3"].muted = true;

  mixer.toggleSolo(mixer.tracks["track1"]);
  expect(mixer.tracks["track1"].soloed).toBe(true);
  expect(mixer.tracks["track1"].volume).toBe(1);
  expect(mixer.tracks["track2"].muted).toBe(false);
  expect(mixer.tracks["track2"].volume).toBe(0);
  expect(mixer.tracks["track3"].volume).toBe(0);

  mixer.toggleSolo(mixer.tracks["track1"]);
  expect(mixer.tracks["track1"].soloed).toBe(false);
  expect(mixer.tracks["track1"].volume).toBe(1);
  expect(mixer.tracks["track2"].volume).toBe(1);
  expect(mixer.tracks["track3"].muted).toBe(true);
  expect(mixer.tracks["track3"].volume).toBe(0);
});

test("Mute toggles a track without changing other tracks", () => {
  const mixer = new Mixer();
  mixer.addTrack("track1", "sample.wav");
  mixer.addTrack("track2", "sample.wav");
  mixer.toggleMute(mixer.tracks["track1"]);
  expect(mixer.tracks["track1"].muted).toBe(true);
  expect(mixer.tracks["track1"].volume).toBe(0);
  expect(mixer.tracks["track2"].muted).toBe(false);

  mixer.toggleMute(mixer.tracks["track1"]);
  expect(mixer.tracks["track1"].muted).toBe(false);
  expect(mixer.tracks["track1"].volume).toBe(1);
});

test("Solo and mute ignore tracks not owned by the mixer", () => {
  const mixer = new Mixer();
  mixer.addTrack("track1", "sample.wav");
  mixer.addTrack("track2", "sample.wav");
  const staleTrack = mixer.tracks["track1"];
  mixer.addTrack("track1", "sample.wav");
  const currentTrack = mixer.tracks["track1"];

  mixer.toggleSolo(staleTrack);
  mixer.toggleMute(staleTrack);

  expect(currentTrack.muted).toBe(false);
  expect(mixer.tracks["track2"].muted).toBe(false);
});

test("Solo state stays consistent when tracks are added, replaced, or removed", () => {
  const mixer = new Mixer();
  mixer.addTrack("track1", "sample.wav");
  mixer.addTrack("track2", "sample.wav");
  mixer.toggleSolo(mixer.tracks["track1"]);
  mixer.addTrack("track3", "sample.wav");
  expect(mixer.tracks["track3"].volume).toBe(0);

  mixer.addTrack("track1", "replacement.wav");
  expect(mixer.tracks["track1"].soloed).toBe(true);
  expect(mixer.tracks["track2"].volume).toBe(0);
  expect(mixer.tracks["track3"].volume).toBe(0);

  mixer.removeTrack("track1");
  expect(mixer.tracks["track2"].volume).toBe(1);
  expect(mixer.tracks["track3"].volume).toBe(1);
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

test("Mixer forwards events to listeners for existing and future tracks", () => {
  const mixer = new Mixer();
  const ready = vi.fn();
  const secondReady = vi.fn();

  mixer.onLoaded = ready;
  mixer.addTrack("track1", "sample.wav");
  const track1Audio = audioInstances.at(-1)!;
  mixer.onLoaded = secondReady;

  const loadedEvent = { data: null };
  track1Audio.emit("loaded", null);
  expect(ready).toHaveBeenCalledWith(loadedEvent);
  expect(secondReady).toHaveBeenCalledWith(loadedEvent);

  const ended = vi.fn();
  const play = vi.fn();
  const pause = vi.fn();
  const stop = vi.fn();
  mixer.onEnded = ended;
  mixer.onPlay = play;
  mixer.onPause = pause;
  mixer.onStop = stop;
  mixer.addTrack("track2", "sample.wav");
  const track2Audio = audioInstances.at(-1)!;

  track2Audio.emit("ended", null);
  track2Audio.emit("play", "playing");
  track2Audio.emit("pause", "paused");
  track2Audio.emit("stop", "stopped");
  expect(ended).toHaveBeenCalledWith({ data: null });
  expect(play).toHaveBeenCalledWith({ data: "playing" });
  expect(pause).toHaveBeenCalledWith({ data: "paused" });
  expect(stop).toHaveBeenCalledWith({ data: "stopped" });
});

type ClockedEngine = { now: number; outputLatency: number; disposed: boolean };

test("Mixer position follows the audio clock, minus output latency", () => {
  const mixer = new Mixer();
  const engine = mixer.engine as unknown as ClockedEngine;
  mixer.addTrack("track1", "sample.wav");
  mixer.seek(2);
  mixer.play();
  expect(mixer.playing).toBe(true);

  // Playback is scheduled 30 ms ahead; the position holds until it starts.
  engine.now = 0.01;
  expect(mixer.currentTime).toBe(2);

  engine.now = 0.53;
  expect(mixer.currentTime).toBeCloseTo(2.5, 6);
  expect(mixer.clockTime).toBeCloseTo(2.5, 6);

  engine.outputLatency = 0.1;
  expect(mixer.currentTime).toBeCloseTo(2.4, 6);

  mixer.pause();
  expect(mixer.currentTime).toBeCloseTo(2.4, 6);
  expect(mixer.clockTime).toBeNull();
});

test("Mixer starts every track at one shared audio-clock time", () => {
  const mixer = new Mixer();
  const engine = mixer.engine as unknown as ClockedEngine;
  mixer.addTrack("track1", "sample.wav");
  const first = audioInstances.at(-1)!;
  mixer.addTrack("track2", "sample.wav");
  const second = audioInstances.at(-1)!;
  const firstPlay = vi.spyOn(first, "play");
  const secondPlay = vi.spyOn(second, "play");

  engine.now = 4;
  mixer.seek(1.5);
  mixer.play();

  expect(firstPlay).toHaveBeenCalledWith(1.5, expect.closeTo(4.03, 6));
  expect(secondPlay).toHaveBeenCalledWith(1.5, expect.closeTo(4.03, 6));
});

test("Seeking while playing restarts each track once, at a shared time", () => {
  const mixer = new Mixer();
  const engine = mixer.engine as unknown as ClockedEngine;
  mixer.addTrack("track1", "sample.wav");
  const first = audioInstances.at(-1)!;
  mixer.addTrack("track2", "sample.wav");
  const second = audioInstances.at(-1)!;
  mixer.play();
  const firstSeek = vi.spyOn(first, "seek");
  const secondSeek = vi.spyOn(second, "seek");

  engine.now = 2;
  mixer.seek(8);

  expect(firstSeek).toHaveBeenCalledTimes(1);
  expect(firstSeek).toHaveBeenCalledWith(8, expect.closeTo(2.03, 6));
  expect(secondSeek).toHaveBeenCalledWith(8, expect.closeTo(2.03, 6));
  engine.now = 2.53;
  expect(mixer.currentTime).toBeCloseTo(8.5, 6);
});

test("Reading the position never touches the tracks", () => {
  const mixer = new Mixer();
  const engine = mixer.engine as unknown as ClockedEngine;
  mixer.addTrack("track1", "sample.wav");
  const audio = audioInstances.at(-1)!;
  mixer.play();
  const seek = vi.spyOn(audio, "seek");
  const play = vi.spyOn(audio, "play");

  for (let frame = 0; frame < 600; frame++) {
    engine.now += 1 / 60;
    void mixer.currentTime;
    void mixer.clockTime;
  }

  expect(seek).not.toHaveBeenCalled();
  expect(play).not.toHaveBeenCalled();
});

test("The transport stops once every track has ended", () => {
  const mixer = new Mixer();
  mixer.addTrack("track1", "sample.wav");
  const audio = audioInstances.at(-1)!;
  mixer.play();
  expect(mixer.playing).toBe(true);

  audio.playing = false;
  audio.emit("ended", null);

  expect(mixer.playing).toBe(false);
  expect(mixer.clockTime).toBeNull();
});

test("Disposing the mixer disposes its owned engine and tracks", () => {
  const mixer = new Mixer();
  const engine = mixer.engine as unknown as ClockedEngine;
  mixer.addTrack("track1", "sample.wav");

  mixer.dispose();

  expect(engine.disposed).toBe(true);
  expect(mixer.listTracks()).toEqual([]);
});
