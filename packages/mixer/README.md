# `@openchart/mixer`

`@openchart/mixer` provides a small multitrack audio mixer built on
[`@openchart/audio`](../audio). It loads audio files,
controls playback and seeking, and exposes track and master volume and mute
controls.

## Create a mixer and control playback

```ts
import Mixer from "@openchart/mixer";

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

Audio files are loaded by `@openchart/audio` and played through the Web Audio
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
track and removes it from the mixer. Call `mixer.dispose()` when you are
done with the mixer; it releases every track and the shared audio context.

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

## Playback position and the audio clock

All tracks play through one shared `AudioEngine` (one `AudioContext`), and the
mixer is the transport. `play()` and `seek()` schedule every track at the same
context time, so stems stay sample-aligned, and `mixer.currentTime` is derived
from that clock (minus the output latency), so it is the single source of truth
for the playback position.

```ts
mixer.play();
function frame() {
  // Read the position; never re-seek the mixer to "stay in sync" while playing.
  const seconds = mixer.clockTime ?? lastKnownSeconds; // null if the clock is not running
  requestAnimationFrame(frame);
}
```

`seek()` is for real jumps (the user moved the playhead). Calling it every
animation frame restarts every stem each time and is audible as crackle.
`clockTime` is `null` while paused or while the audio context is suspended.

Gain changes (volume, mute, solo) and every start/stop are smoothed with short
fades to avoid clicks, and the master bus has a soft clipper so stems that sum
past full scale saturate gently rather than hard-clipping.
