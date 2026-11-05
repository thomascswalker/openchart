import { buildModuleId, type ModuleCollection } from "./modules";

export type Listener = () => void;
export type Subscription = (listener: () => void) => () => void;

export abstract class Service {
  /** Set of listeners subscribed to this service. */
  protected readonly listeners = new Set<Listener>();

  /** Reset the service to its initial state. */
  public abstract reset(): void;

  /** Subscribe a listener to this service. Returns an unsubscribe function. */
  public readonly subscribe: Subscription = (listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Notify all subscribed listeners of a change in the service. */
  protected notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export type IService = InstanceType<typeof Service>;

export abstract class StatefulService<T> extends Service {
  /** Internal snapshot of the service's state. */
  protected _snapshot!: T;

  constructor() {
    super();
    this._snapshot = (this.constructor as typeof StatefulService)
      .defaultSnapshot() as T;
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

export interface ServicesAccessor {
  get<T>(serviceId: string): T;
}

type ServiceConstructor = new (...dependencies: unknown[]) => Service;

export class ServiceRegistry {
  private ctors = new Map<string, ServiceConstructor>();
  private instances = new Map<string, unknown>();

  constructor(modules: ModuleCollection) {
    for (const filepath of Object.keys(modules).sort()) {
      const generatedId = buildModuleId(filepath, "services");
      if (!generatedId || generatedId.split(".").at(-1) === "index") {
        continue;
      }

      const serviceClasses = Object.values(modules[filepath]).filter(
        (candidate): candidate is ServiceConstructor =>
          typeof candidate === "function" &&
          candidate.prototype instanceof Service,
      );
      if (!serviceClasses.length) {
        continue;
      }
      if (serviceClasses.length > 1) {
        throw new Error(`Multiple services exported from ${filepath}.`);
      }

      const ServiceClass = serviceClasses[0];
      if (ServiceClass) {
        const segments = generatedId.split(".");
        if (
          segments.length > 1 &&
          segments.at(-1) === segments.at(-2)
        ) {
          segments.pop();
        }
        const id =
          (ServiceClass as ServiceConstructor & { id?: string }).id ??
          segments.join(".");
        this.register(id, ServiceClass);
      }
    }
  }

  public register(id: string, ctor: ServiceConstructor): void {
    if (this.ctors.has(id)) {
      throw new Error(`Service ${id} is already registered.`);
    }
    this.ctors.set(id, ctor);
  }

  public hasService(id: string): boolean {
    return this.ctors.has(id);
  }

  public get<T extends IService>(id: string): T {
    if (this.instances.has(id)) {
      return this.instances.get(id) as T;
    }

    const TargetClass = this.ctors.get(id);
    if (!TargetClass) {
      throw new Error(`No service class registered under ID: ${id}`);
    }

    const dependencies: string[] =
      (TargetClass as ServiceConstructor & { dependencies?: string[] })
        .dependencies ?? [];
    const resolved = dependencies.map((depId) => this.get(depId));
    const instance = new TargetClass(...resolved);
    this.instances.set(id, instance);

    return instance as T;
  }

  public createAccessor(): ServicesAccessor {
    return {
      get: <T>(serviceId: string): T => {
        const service = this.get(serviceId);
        if (!service) {
          throw new Error(`Service not found: ${serviceId}`);
        }
        return service as T;
      },
    };
  }
}
