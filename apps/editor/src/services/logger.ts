import type { PublicMethods } from "../util/meta";

export class LoggerService {
  static dependencies = [];

  public debug(message: string) {
    console.debug(`[DEBUG]: ${message}`);
  }
  public info(message: string) {
    console.info(`[INFO]: ${message}`);
  }
  public warn(message: string) {
    console.warn(`[WARN]: ${message}`);
  }
  public error(message: string) {
    console.error(`[ERROR]: ${message}`);
  }
}

export type ILoggerService = PublicMethods<LoggerService>;
