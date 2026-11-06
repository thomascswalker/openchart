export type Listener = () => void;
export type Subscription = (listener: () => void) => () => void;

const Dependencies = Symbol('service.dependencies');

type AnyConstructor = abstract new (...args: never[]) => unknown;
type DependencyTarget = AnyConstructor & { [Dependencies]?: string[] };

/**
 * A constructor parameter decorator which injects the service registered under
 * `serviceId`. `T` only ties the decorator to the service's interface.
 */
export interface ServiceDecorator<T> {
  (
    target: object,
    propertyKey: string | symbol | undefined,
    index: number,
  ): void;
  readonly serviceId: string;
  readonly type?: T;
}

/** Creates the parameter decorator which injects the service with the given ID. */
export function createDecorator<T>(serviceId: string): ServiceDecorator<T> {
  const decorator = (
    target: object,
    _propertyKey: string | symbol | undefined,
    index: number,
  ): void => {
    const ctor = target as DependencyTarget;
    if (!Object.hasOwn(ctor, Dependencies)) {
      Object.defineProperty(ctor, Dependencies, { value: [] });
    }
    ctor[Dependencies]![index] = serviceId;
  };
  return Object.assign(decorator, { serviceId }) as ServiceDecorator<T>;
}

/** Service IDs of the constructor parameters of `target`, in parameter order. */
export function getDependencies(target: AnyConstructor): string[] {
  const ctor = target as DependencyTarget;
  return Object.hasOwn(ctor, Dependencies) ? [...ctor[Dependencies]!] : [];
}

export abstract class Service {
  /** Set of listeners subscribed to this service. */
  protected readonly listeners = new Set<Listener>();

  public init(): void {}

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
