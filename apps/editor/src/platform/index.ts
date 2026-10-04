import { ActionRegistry } from "./actions";
import { ContextStore } from "./context";
import { globModules } from "./modules";
import { ServiceRegistry } from "./services";
import { createContext, useContext } from "react";

const serviceModules = globModules("services");
const services = new ServiceRegistry(serviceModules);
const context = new ContextStore();
const actionModules = globModules("actions");
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
