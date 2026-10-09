# `@midiedit/mixer`

`@midiedit/mixer` provides a small multitrack audio mixer built on
[`ts-audio`](https://www.npmjs.com/package/ts-audio). It loads audio files,
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

Audio files are loaded by `ts-audio` in the current runtime. In a browser, use
URLs the browser can fetch; in Node.js, use a runtime and audio source supported
by `ts-audio`.

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

Use `listTracks()` to retrieve the track IDs. `removeTrack(id)` destroys the
audio instance and removes it from the mixer.

## Respond to mixer events

The event properties accept callbacks for audio readiness, state changes, and
playback start and end. `onChange` runs after mixer operations and forwarded
track events, which is useful for keeping UI state in sync.

```ts
mixer.onReady = (event) => {
  console.log("Audio ready", event.data);
};
mixer.onState = (event) => {
  console.log("Audio state", event.data);
};
mixer.onStart = () => console.log("Playback started");
mixer.onEnd = () => console.log("Playback ended");
mixer.onChange = () => {
  console.log("Time:", mixer.currentTime);
};
```
