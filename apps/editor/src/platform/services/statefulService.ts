import { Service } from './service';

export abstract class StatefulService<T> extends Service {
  /** Internal snapshot of the service's state. */
  protected _snapshot!: T;

  constructor() {
    super();
    this._snapshot = (
      this.constructor as typeof StatefulService
    ).defaultSnapshot() as T;
  }

  /** Set the current snapshot of the service's state. */
  protected setSnapshot(value: T) {
    this._snapshot = value;
  }

  /** Retrieve the current snapshot of the service's state. */
  public readonly getSnapshot = (): T => this._snapshot;

  public static defaultSnapshot(): unknown {
    return {};
  }
}

export type IStatefulService = InstanceType<typeof StatefulService>;
