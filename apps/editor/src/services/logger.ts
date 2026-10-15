import { IService } from "../platform/services";

export class LoggerService extends IService {
  static dependencies = [];

  public readonly reset = (): void => this.notify();

  public debug(message: string) {
    console.debug(`[DEBUG]: ${message}`);
    this.notify();
  }
  public info(message: string) {
    console.info(`[INFO]: ${message}`);
    this.notify();
  }
  public warn(message: string) {
    console.warn(`[WARN]: ${message}`);
    this.notify();
  }
  public error(message: string) {
    console.error(`[ERROR]: ${message}`);
    this.notify();
  }
}
