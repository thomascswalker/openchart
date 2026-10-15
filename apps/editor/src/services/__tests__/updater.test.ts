import { beforeEach, describe, expect, it, vi } from "vitest";
import { ServiceRegistry } from "../../platform/services";
import { UpdaterService } from "../updater";
import { LoggerService } from "../logger";

const mocks = vi.hoisted(() => ({
  check: vi.fn(),
  relaunch: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-updater", () => ({ check: mocks.check }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: mocks.relaunch }));

type DownloadCallback = (event: unknown) => void;

function createLogger(): LoggerService {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    reset: vi.fn(),
    subscribe: vi.fn(() => () => {}),
  } as unknown as LoggerService;
}

function createUpdate(
  downloadAndInstall: (onEvent: DownloadCallback) => Promise<void> = async (
    onEvent,
  ) => {
    onEvent({ event: "Started", data: { contentLength: 100 } });
    onEvent({ event: "Progress", data: { chunkLength: 40 } });
    onEvent({ event: "Progress", data: { chunkLength: 60 } });
    onEvent({ event: "Finished" });
  },
) {
  return {
    version: "0.1.5",
    currentVersion: "0.1.4",
    body: "Bug fixes",
    downloadAndInstall: vi.fn(downloadAndInstall),
    close: vi.fn(async () => {}),
  };
}

describe("UpdaterService", () => {
  beforeEach(() => {
    mocks.check.mockReset();
    mocks.relaunch.mockReset();
  });

  it("registers under the updater id with its logger dependency", () => {
    const services = new ServiceRegistry({
      "../services/logger.ts": { LoggerService },
      "../services/updater.ts": { UpdaterService },
    });
    expect(services.get("updater")).toBeInstanceOf(UpdaterService);
  });

  it("starts idle", () => {
    const service = new UpdaterService(createLogger());
    expect(service.getSnapshot().status).toBe("idle");
  });

  it("reports up-to-date when no update is returned", async () => {
    mocks.check.mockResolvedValue(null);
    const service = new UpdaterService(createLogger());
    await service.check();
    expect(service.getSnapshot().status).toBe("up-to-date");
  });

  it("reports an available update with versions and notes", async () => {
    mocks.check.mockResolvedValue(createUpdate());
    const service = new UpdaterService(createLogger());
    await service.check();
    expect(service.getSnapshot()).toMatchObject({
      status: "available",
      currentVersion: "0.1.4",
      availableVersion: "0.1.5",
      notes: "Bug fixes",
    });
  });

  it("reports errors from the check", async () => {
    mocks.check.mockRejectedValue(new Error("offline"));
    const logger = createLogger();
    const service = new UpdaterService(logger);
    await service.check();
    expect(service.getSnapshot()).toMatchObject({
      status: "error",
      errorPhase: "check",
      error: "offline",
    });
    expect(logger.error).toHaveBeenCalled();
  });

  it("ignores repeated checks while a check is in flight", async () => {
    let resolve!: (value: null) => void;
    mocks.check.mockReturnValue(
      new Promise<null>((r) => {
        resolve = r;
      }),
    );
    const service = new UpdaterService(createLogger());
    const first = service.check();
    // Let the dynamic import settle so check() has been called.
    await vi.waitFor(() => expect(mocks.check).toHaveBeenCalledTimes(1));
    await service.check();
    expect(mocks.check).toHaveBeenCalledTimes(1);
    resolve(null);
    await first;
    expect(service.getSnapshot().status).toBe("up-to-date");
  });

  it("downloads, installs, and relaunches", async () => {
    const statuses: string[] = [];
    const update = createUpdate(async (onEvent) => {
      onEvent({ event: "Started", data: { contentLength: 100 } });
      statuses.push(service.getSnapshot().status);
      onEvent({ event: "Progress", data: { chunkLength: 40 } });
      onEvent({ event: "Progress", data: { chunkLength: 60 } });
      expect(service.getSnapshot().downloadedBytes).toBe(100);
      onEvent({ event: "Finished" });
      statuses.push(service.getSnapshot().status);
    });
    mocks.check.mockResolvedValue(update);
    mocks.relaunch.mockResolvedValue(undefined);
    const service = new UpdaterService(createLogger());
    await service.check();
    await service.install();

    expect(statuses).toEqual(["downloading", "installing"]);
    expect(service.getSnapshot().totalBytes).toBe(100);
    expect(update.downloadAndInstall).toHaveBeenCalledOnce();
    expect(mocks.relaunch).toHaveBeenCalledOnce();
  });

  it("reports install failures", async () => {
    mocks.check.mockResolvedValue(
      createUpdate(async () => {
        throw new Error("bad signature");
      }),
    );
    const service = new UpdaterService(createLogger());
    await service.check();
    await service.install();
    expect(service.getSnapshot()).toMatchObject({
      status: "error",
      errorPhase: "install",
      error: "bad signature",
    });
    expect(mocks.relaunch).not.toHaveBeenCalled();
  });

  it("does nothing when installing without an available update", async () => {
    const service = new UpdaterService(createLogger());
    await service.install();
    expect(service.getSnapshot().status).toBe("idle");
  });

  it("dismisses back to idle and releases the pending update", async () => {
    const update = createUpdate();
    mocks.check.mockResolvedValue(update);
    const service = new UpdaterService(createLogger());
    await service.check();
    service.dismiss();
    expect(service.getSnapshot().status).toBe("idle");
    expect(update.close).toHaveBeenCalledOnce();
  });
});
