import { ActionRegistry } from "./actions";
import { ContextStore } from "./context";
import { ServiceRegistry } from "./services";
import { createContext, useContext } from "react";

const serviceModules = import.meta.glob<Record<string, unknown>>(
  ["../services/**/*.ts", "!../services/**/__tests__/**"],
  { eager: true },
);
const actionModules = import.meta.glob<Record<string, unknown>>(
  ["../actions/**/*.ts", "!../actions/**/__tests__/**"],
  { eager: true },
);

const services = new ServiceRegistry(serviceModules);
const context = new ContextStore();
const actions = new ActionRegistry(services, context, actionModules);

const Platform = {
  services,
  context,
  actions,
};

const PlatformContext = createContext(Platform);
const PlatformProvider = PlatformContext.Provider;

function useService<T>(serviceId: string): T {
  const platform = useContext(PlatformContext);
  return platform.services.get(serviceId) as T;
}

function usePlatform() {
  return useContext(PlatformContext);
}

export default Platform;
export { PlatformContext, PlatformProvider, useService, usePlatform };
