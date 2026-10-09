import { AudioBuffer, AudioContext } from "standardized-audio-context-mock";
import { vi } from "vitest";

vi.stubGlobal("AudioBuffer", AudioBuffer);
vi.stubGlobal("AudioContext", AudioContext);
