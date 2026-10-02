export interface ServicesAccessor {
  get<T>(serviceId: string): T;
}

export class ServiceRegistry {
  private ctors = new Map<string, any>();
  private instances = new Map<string, any>();

  public register(id: string, ctor: any): void {
    this.ctors.set(id, ctor);
  }

  public get<T>(id: string): T {
    if (this.instances.has(id)) {
      return this.instances.get(id) as T;
    }

    const TargetClass = this.ctors.get(id);
    if (!TargetClass) {
      throw new Error(`No service class registered under ID: ${id}`);
    }

    const dependencies: string[] = TargetClass.dependencies || [];
    const resolved = dependencies.map((depId) => this.get(depId));
    const instance = new TargetClass(...resolved);
    this.instances.set(id, instance);

    return instance;
  }

  public createAccessor(): ServicesAccessor {
    return {
      get: <T>(serviceId: string): T => {
        const service = this.get<T>(serviceId);
        if (!service) {
          throw new Error(`Service not found: ${serviceId}`);
        }
        return service as T;
      },
    };
  }
}
