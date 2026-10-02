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

export class CommandRegistry {
  private commands = new Map<string, Action>();
  public serviceRegistry: ServiceRegistry;
  public contextStore: ContextStore;

  constructor(serviceRegistry: ServiceRegistry, contextStore: ContextStore) {
    this.serviceRegistry = serviceRegistry;
    this.contextStore = contextStore;
  }

  public registerCommand(action: Action): void {
    this.commands.set(action.options.id, action);
  }

  public executeCommand(id: string, ...args: any[]): void {
    const action = this.commands.get(id);
    if (!action) {
      console.error(`Command ${id} not found.`);
      return;
    }

    if (!this.contextStore.evaluate(action.options.condition)) {
      console.warn(`Command ${id} cannot execute: Conditions not met.`);
      return;
    }

    const accessor = this.serviceRegistry.createAccessor();
    action.run(accessor, ...args);
  }
}
