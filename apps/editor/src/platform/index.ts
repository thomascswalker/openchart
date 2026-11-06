import { ActionRegistry } from "./actions";
import { ContextStore } from "./context";
import {
  ServiceRegistry,
  type IService,
  type IStatefulService,
} from "./services";
import { createContext, useContext, useSyncExternalStore } from "react";

const serviceModules = import.meta.glob<Record<string, unknown>>(
  [
    "./services/**/*.ts",
    "!./services/services/**",
    "!./services/**/__tests__/**",
    "!./services/**/__mock__/**",
  ],
  { eager: true },
);
const actionModules = import.meta.glob<Record<string, unknown>>(
  [
    "./actions/**/*.ts",
    "!./actions/**/__tests__/**",
    "!./actions/**/__mocks__/**",
  ],
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

function useService<T extends IService>(serviceId: string): T {
  const platform = useContext(PlatformContext);
  return platform.services.get(serviceId) as T;
}

function useSnapshot<T>(serviceId: string): T {
  const platform = useContext(PlatformContext);
  const service: IStatefulService = platform.services.get(serviceId);
  const getSnapshot = service.getSnapshot.bind(service);
  return useSyncExternalStore(service.subscribe, getSnapshot, getSnapshot) as T;
}

function usePlatform() {
  return useContext(PlatformContext);
}

export default Platform;
export {
  PlatformContext,
  PlatformProvider,
  useService,
  usePlatform,
  useSnapshot,
};
