import type { ContextStore } from "./context";
import type { ServiceRegistry, ServicesAccessor } from "./services";

export interface ActionOptions {
  id: string;
  condition?: Record<string, any>;
}

export abstract class Action {
  public options: ActionOptions;

  constructor(options: ActionOptions) {
    this.options = options;
  }
  abstract run(
    accessor: ServicesAccessor,
    ...args: any[]
  ): void | Promise<void>;
}

export class ActionRegistry {
  private actions = new Map<string, Action>();
  public serviceRegistry: ServiceRegistry;
  public contextStore: ContextStore;

  constructor(serviceRegistry: ServiceRegistry, contextStore: ContextStore) {
    this.serviceRegistry = serviceRegistry;
    this.contextStore = contextStore;
  }

  public registerAction(action: Action): void {
    this.actions.set(action.options.id, action);
  }

  public executeAction(id: string, ...args: any[]): void {
    const action = this.actions.get(id);
    if (!action) {
      console.error(`Action ${id} not found.`);
      return;
    }

    if (!this.contextStore.evaluate(action.options.condition)) {
      console.warn(`Action ${id} cannot execute: Conditions not met.`);
      return;
    }

    const accessor = this.serviceRegistry.createAccessor();
    action.run(accessor, ...args);
  }
}
