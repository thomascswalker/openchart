# `@midiedit/mixer`

`@midiedit/mixer` provides a small multitrack audio mixer built on
[`@midiedit/audio`](../audio). It loads audio files,
controls playback and seeking, and exposes track and master volume and mute
controls.

## Create a mixer and control playback

```ts
import Mixer from "@midiedit/mixer";

const mixer = new Mixer();
mixer.addTrack("backing", "audio/backing.ogg");
mixer.addTrack("drums", "audio/drums.ogg");

mixer.masterVolume = 0.8;
mixer.play();

console.log(mixer.playing, mixer.currentTime, mixer.duration);

mixer.pause();
mixer.seek(10); // Seek to 10 seconds.
mixer.play();
mixer.stop();
```

Audio files are loaded by `@midiedit/audio` and played through the Web Audio
API. Provide a filesystem path that the audio package can read in the current
runtime.

## Control individual tracks

Tracks are addressed by the IDs supplied to `addTrack`. The per-track `volume`
is multiplied by `masterVolume`; muting silences a track without discarding its
volume setting.

```ts
const backing = mixer.getTrack("backing");
if (backing) {
  backing.volume = 0.6;
  backing.toggleMute();
  backing.toggleMute();
}

mixer.mute("drums");
mixer.solo("backing"); // Mutes every other track.
```

Use `listTracks()` to retrieve the track IDs. `removeTrack(id)` disposes the
track's audio context and removes it from the mixer.

## Respond to mixer events

The event properties mirror `AudioSample` callbacks. `onChange` runs after
mixer operations and forwarded track events, which is useful for keeping UI
state in sync.

```ts
mixer.onLoaded = () => console.log("Audio loaded");
mixer.onPlay = () => console.log("Playback started");
mixer.onPause = () => console.log("Playback paused");
mixer.onStop = () => console.log("Playback stopped");
mixer.onEnded = () => console.log("Playback ended");
mixer.onChange = () => {
  console.log("Time:", mixer.currentTime);
};
```
