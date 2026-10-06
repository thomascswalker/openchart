import type { PublicMethods } from "../util/meta";
import { IService } from "../platform/services";

export class LoggerService extends IService {
  static dependencies = [];

  private readonly listeners = new Set<() => void>();

  public readonly reset = (): void => this.publish();

  public readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  public debug(message: string) {
    console.debug(`[DEBUG]: ${message}`);
    this.publish();
  }
  public info(message: string) {
    console.info(`[INFO]: ${message}`);
    this.publish();
  }
  public warn(message: string) {
    console.warn(`[WARN]: ${message}`);
    this.publish();
  }
  public error(message: string) {
    console.error(`[ERROR]: ${message}`);
    this.publish();
  }

  private publish(): void {
    for (const listener of this.listeners) listener();
  }
}

export type ILoggerService = PublicMethods<LoggerService>;
