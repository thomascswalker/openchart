import type { DownloadEvent, Update } from "@tauri-apps/plugin-updater";
import type { ILoggerService } from "./logger";
import { IStatefulService } from "../platform/services";

export type UpdaterStatus =
  | "idle"
  | "checking"
  | "up-to-date"
  | "available"
  | "downloading"
  | "installing"
  | "error";

export interface UpdaterSnapshot {
  status: UpdaterStatus;
  currentVersion: string | null;
  availableVersion: string | null;
  notes: string | null;
  downloadedBytes: number;
  totalBytes: number | null;
  /** Which step failed when status is "error". */
  errorPhase: "check" | "install" | null;
  error: string | null;
}

const CHECK_TIMEOUT_MS = 30_000;

const initialSnapshot = (): UpdaterSnapshot => ({
  status: "idle",
  currentVersion: null,
  availableVersion: null,
  notes: null,
  downloadedBytes: 0,
  totalBytes: null,
  errorPhase: null,
  error: null,
});

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return "An unknown error occurred.";
}

/**
 * Wraps the Tauri updater plugin. The plugin modules are imported lazily so
 * the web build never loads them.
 */
export class UpdaterService extends IStatefulService<UpdaterSnapshot> {
  static dependencies = ["logger"];

  private _logger: ILoggerService;
  private _pending: Update | null = null;

  constructor(logger: ILoggerService) {
    super();
    this._logger = logger;
    this._snapshot = initialSnapshot();
  }

  public readonly reset = (): void => {
    this.releasePending();
    this._snapshot = initialSnapshot();
    this.notify();
  };

  public readonly isBusy = (): boolean => {
    const { status } = this._snapshot;
    return (
      status === "checking" ||
      status === "downloading" ||
      status === "installing"
    );
  };

  public readonly canDismiss = (): boolean => {
    const { status } = this._snapshot;
    return (
      status === "up-to-date" || status === "available" || status === "error"
    );
  };

  public readonly check = async (): Promise<void> => {
    if (this.isBusy()) return;

    this.releasePending();
    this._snapshot = { ...initialSnapshot(), status: "checking" };
    this.notify();

    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check({ timeout: CHECK_TIMEOUT_MS });
      if (!update) {
        this._logger.info("No update available.");
        this.setState({ status: "up-to-date" });
        return;
      }
      this._pending = update;
      this._logger.info(`Update ${update.version} is available.`);
      this.setState({
        status: "available",
        currentVersion: update.currentVersion,
        availableVersion: update.version,
        notes: update.body?.trim() ? update.body : null,
      });
    } catch (error: unknown) {
      const message = errorMessage(error);
      this._logger.error(`Update check failed: ${message}`);
      this.setState({ status: "error", errorPhase: "check", error: message });
    }
  };

  public readonly install = async (): Promise<void> => {
    const update = this._pending;
    if (this._snapshot.status !== "available" || !update) return;

    this.setState({
      status: "downloading",
      downloadedBytes: 0,
      totalBytes: null,
    });

    let downloaded = 0;
    let total: number | null = null;
    let lastReported = -1;

    const onEvent = (event: DownloadEvent): void => {
      switch (event.event) {
        case "Started":
          total = event.data.contentLength ?? null;
          this.setState({ totalBytes: total });
          break;
        case "Progress": {
          downloaded += event.data.chunkLength;
          // Only re-render when the visible progress changes.
          const marker = total
            ? Math.floor((downloaded / total) * 100)
            : Math.floor(downloaded / (1024 * 1024));
          if (marker !== lastReported) {
            lastReported = marker;
            this.setState({ downloadedBytes: downloaded });
          }
          break;
        }
        case "Finished":
          this.setState({ status: "installing", downloadedBytes: downloaded });
          break;
      }
    };

    try {
      await update.downloadAndInstall(onEvent);
      this._logger.info("Update installed; relaunching.");
      // On Windows the installer exits the app before this point.
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (error: unknown) {
      const message = errorMessage(error);
      this._logger.error(`Update install failed: ${message}`);
      this.setState({ status: "error", errorPhase: "install", error: message });
    }
  };

  public readonly dismiss = (): void => {
    if (!this.canDismiss()) return;
    this.releasePending();
    this._snapshot = initialSnapshot();
    this.notify();
  };

  private releasePending(): void {
    const pending = this._pending;
    this._pending = null;
    if (pending) {
      void pending.close().catch(() => {});
    }
  }

  private setState(change: Partial<UpdaterSnapshot>): void {
    this._snapshot = { ...this._snapshot, ...change };
    this.notify();
  }
}
