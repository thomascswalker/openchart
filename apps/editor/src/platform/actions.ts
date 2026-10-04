import type { ContextStore } from "./context";
import { moduleId, type ModuleCollection } from "./modules";
import type { ServiceRegistry, ServicesAccessor } from "./services";

export interface ActionOptions {
  id?: string;
  condition?: Record<string, unknown>;
}

export class ActionUnavailableError extends Error {
  constructor(id: string) {
    super(`Action ${id} is not available in the current context.`);
    this.name = "ActionUnavailableError";
  }
}

export class ActionNotFoundError extends Error {
  constructor(id: string) {
    super(`Action ${id} is not registered.`);
    this.name = "ActionNotFoundError";
  }
}

export class ActionCancelledError extends Error {
  constructor(message = "Action was cancelled.") {
    super(message);
    this.name = "ActionCancelledError";
  }
}

export abstract class Action<Args extends unknown[] = [], Result = void> {
  public options: ActionOptions;

  constructor(options: ActionOptions) {
    this.options = options;
  }
  abstract run(
    accessor: ServicesAccessor,
    ...args: Args
  ): Result | Promise<Result>;
}

interface RegisteredAction {
  options: ActionOptions;
  run(accessor: ServicesAccessor, ...args: unknown[]): unknown;
}
type ActionConstructor = new () => Action<unknown[], unknown>;

export class ActionRegistry {
  private actions = new Map<string, RegisteredAction>();
  public serviceRegistry: ServiceRegistry;
  public contextStore: ContextStore;

  constructor(
    serviceRegistry: ServiceRegistry,
    contextStore: ContextStore,
    modules: ModuleCollection,
  ) {
    this.serviceRegistry = serviceRegistry;
    this.contextStore = contextStore;

    for (const filepath of Object.keys(modules).sort()) {
      const id = moduleId(filepath, "actions");
      if (!id) {
        continue;
      }

      const actionClasses = Object.values(modules[filepath]).filter(
        (candidate): candidate is ActionConstructor =>
          typeof candidate === "function" &&
          candidate.prototype instanceof Action,
      );
      if (!actionClasses.length) {
        continue;
      }
      if (actionClasses.length > 1) {
        throw new Error(`Multiple actions exported from ${filepath}.`);
      }

      const ActionClass = actionClasses[0];
      if (ActionClass) {
        this.registerAction(new ActionClass(), id);
      }
    }
  }

  public registerAction<Args extends unknown[], Result>(
    action: Action<Args, Result>,
    id = action.options.id,
  ): void {
    if (!id) {
      throw new Error("An action ID is required when registering an action.");
    }
    if (this.actions.has(id)) {
      throw new Error(`Action ${id} is already registered.`);
    }
    this.actions.set(id, action as RegisteredAction);
  }

  public hasAction(id: string): boolean {
    return this.actions.has(id);
  }

  public isAvailable(id: string): boolean {
    const action = this.actions.get(id);
    return Boolean(
      action && this.contextStore.evaluate(action.options.condition),
    );
  }

  public executeAction<Result = unknown>(
    id: string,
    ...args: unknown[]
  ): Result | Promise<Result> {
    const action = this.actions.get(id);
    if (!action) {
      throw new ActionNotFoundError(id);
    }

    if (!this.contextStore.evaluate(action.options.condition)) {
      throw new ActionUnavailableError(id);
    }

    const accessor = this.serviceRegistry.createAccessor();
    try {
      const result = action.run(accessor, ...args);
      if (
        typeof result === "object" &&
        result !== null &&
        "then" in result &&
        typeof result.then === "function"
      ) {
        return Promise.resolve(result).catch((error: unknown) => {
          throw this.normalizeError(error);
        }) as Promise<Result>;
      }
      return result as Result;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  private normalizeError(error: unknown): Error {
    if (error instanceof DOMException && error.name === "AbortError") {
      return new ActionCancelledError(error.message);
    }
    return error instanceof Error ? error : new Error(String(error));
  }
}
