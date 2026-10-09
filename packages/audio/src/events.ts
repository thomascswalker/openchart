export type AudioEvent = "loaded" | "play" | "pause" | "stop" | "ended";

export interface AudioEventData {
  data: unknown;
}

export type AudioEventCallback = (event: AudioEventData) => void;
