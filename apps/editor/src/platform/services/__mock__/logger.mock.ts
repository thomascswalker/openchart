import { vi } from "vitest";
import { type LoggerService } from "../logger";

type ILoggerService = LoggerService;

export function mockLoggerService(): ILoggerService {
  return {
    debug: vi.fn().mockImplementation((_: string) => {}),
    info: vi.fn().mockImplementation((_: string) => {}),
    warn: vi.fn().mockImplementation((_: string) => {}),
    error: vi.fn().mockImplementation((_: string) => {}),
    reset: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    listeners: new Set<() => void>(),
    notify: vi.fn(),
  } as unknown as ILoggerService;
}
