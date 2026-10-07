import { Audio as AudioFactory } from "ts-audio";

export type Audio = ReturnType<typeof AudioFactory>;
export type AudioEvent = Parameters<Audio["on"]>[0];
export type AudioEventCallback = Parameters<Audio["on"]>[1];
