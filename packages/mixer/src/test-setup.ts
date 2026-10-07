import { vi } from "vitest";

vi.mock("ts-audio", () => ({
  Audio: () => ({
    volume: 1,
    destroy: () => {},
  }),
}));
