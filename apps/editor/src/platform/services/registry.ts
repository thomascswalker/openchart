import { type ModuleCollection, buildModuleId } from '../modules';
import { type IService, Service, getDependencies } from './service';

export interface ServicesAccessor {
  get<T>(serviceId: string): T;
}

export type ServiceConstructor = new (...dependencies: unknown[]) => Service;

export class ServiceRegistry {
  private ctors = new Map<string, ServiceConstructor>();
  private instances = new Map<string, unknown>();
  private resolving = new Set<string>();

  constructor(modules: ModuleCollection) {
    for (const filepath of Object.keys(modules).sort()) {
      const generatedId = buildModuleId(filepath, 'services');
      if (!generatedId || generatedId.split('.').at(-1) === 'index') {
        continue;
      }

      const serviceClasses = Object.values(modules[filepath]).filter(
        (candidate): candidate is ServiceConstructor =>
          typeof candidate === 'function' &&
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
        const segments = generatedId.split('.');
        if (segments.length > 1 && segments.at(-1) === segments.at(-2)) {
          segments.pop();
        }
        const id =
          (ServiceClass as ServiceConstructor & { id?: string }).id ??
          segments.join('.');
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

  public has(id: string): boolean {
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

    if (this.resolving.has(id)) {
      throw new Error(`Circular dependency detected while resolving ${id}`);
    }
    this.resolving.add(id);
    try {
      const resolved = getDependencies(TargetClass).map((depId) => {
        if (!this.ctors.has(depId)) {
          throw new Error(
            `${TargetClass.name} depends on ${depId}, which is not registered.`,
          );
        }
        return this.get(depId);
      });

      const instance = new TargetClass(...resolved);
      instance.init();
      this.instances.set(id, instance);
      return instance as T;
    } finally {
      this.resolving.delete(id);
    }
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
