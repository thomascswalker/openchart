import { ActionRegistry } from "./actions";
import { ContextStore } from "./context";
import { ServiceRegistry } from "./services";
import { createContext, useContext } from "react";

type ServiceConstructor = new (...dependencies: unknown[]) => unknown;
const serviceModules = import.meta.glob<Record<string, unknown>>(
  "../services/*.ts",
  {
    eager: true,
  },
);

function bootstrap(): ServiceRegistry {
  const services = new ServiceRegistry();

  for (const [filepath, module] of Object.entries(serviceModules)) {
    const filename = filepath
      .slice(filepath.lastIndexOf("/") + 1)
      .replace(/\.ts$/, "");
    const serviceId = `global.${filename}`;
    const ServiceClass = Object.values(module).find(
      (exported): exported is ServiceConstructor =>
        typeof exported === "function",
    );

    if (!ServiceClass) {
      throw new Error(`No service class exported from ${filepath}`);
    }

    services.register(serviceId, ServiceClass);
    console.log(`Registered service: ${serviceId}`);
  }

  return services;
}

const services = bootstrap();
const context = new ContextStore();
const actions = new ActionRegistry(services, context);

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

export default Platform;
export { PlatformContext, PlatformProvider, useService };
