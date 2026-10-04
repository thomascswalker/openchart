import { Action, type ActionRegistry } from "./actions";
import { ServiceRegistry } from "./services";

export type ModuleCollection = Record<string, Record<string, unknown>>;

type ActionConstructor = new () => Action<unknown[], unknown>;
type ServiceConstructor = new (...dependencies: any[]) => unknown;

function moduleId(filepath: string, root: string): string | null {
  const prefix = `../${root}/`;
  if (
    !filepath.startsWith(prefix) ||
    /(?:^|\/)__tests__(?:\/|$)|\.test\./.test(filepath)
  ) {
    return null;
  }

  const relativePath = filepath
    .slice(prefix.length)
    .replace(/\.(?:[cm]?[jt]sx?)$/, "");
  if (!relativePath) return null;

  return relativePath
    .split("/")
    .map((segment) =>
      segment
        .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
        .replace(/[^a-zA-Z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase(),
    )
    .join(".");
}

export function registerDiscoveredActions(
  registry: ActionRegistry,
  modules: ModuleCollection,
): void {
  for (const filepath of Object.keys(modules).sort()) {
    const id = moduleId(filepath, "actions");
    if (!id) continue;

    const actionClasses = Object.values(modules[filepath]).filter(
      (candidate): candidate is ActionConstructor =>
        typeof candidate === "function" &&
        candidate.prototype instanceof Action,
    );
    if (!actionClasses.length) continue;
    if (actionClasses.length > 1) {
      throw new Error(`Multiple actions exported from ${filepath}.`);
    }

    const ActionClass = actionClasses[0];
    if (ActionClass) registry.registerAction(new ActionClass(), id);
  }
}

export function registerDiscoveredServices(
  registry: ServiceRegistry,
  modules: ModuleCollection,
): void {
  for (const filepath of Object.keys(modules).sort()) {
    const id = moduleId(filepath, "services");
    if (!id) continue;

    const serviceClasses = Object.values(modules[filepath]).filter(
      (candidate): candidate is ServiceConstructor =>
        typeof candidate === "function" &&
        /^class\s/.test(Function.prototype.toString.call(candidate)),
    );
    if (!serviceClasses.length) continue;
    if (serviceClasses.length > 1) {
      throw new Error(`Multiple services exported from ${filepath}.`);
    }

    const ServiceClass = serviceClasses[0];
    if (ServiceClass) registry.register(id, ServiceClass);
  }
}
