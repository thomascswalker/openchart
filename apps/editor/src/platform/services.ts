import { moduleId, type ModuleCollection } from "./modules";

export type Listener = () => void;
export type Subscription = (listener: () => void) => () => void;

export abstract class Service {
  protected readonly listeners = new Set<Listener>();

  public abstract readonly reset: () => void;

  public readonly subscribe: Subscription = (listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  protected notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export type IService = InstanceType<typeof Service>;

export abstract class StatefulService<T> extends Service {
  protected _snapshot!: T;

  public get snapshot(): T {
    return this.getSnapshot();
  }

  public readonly getSnapshot = (): T => this._snapshot;
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
      const id = moduleId(filepath, "services");
      if (!id) {
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
