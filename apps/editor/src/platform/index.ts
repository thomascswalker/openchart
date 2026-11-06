import { createContext, useContext, useSyncExternalStore } from 'react';

import { ActionRegistry } from './actions';
import { ContextStore } from './context';
import { ServiceRegistry } from './services/registry';
import { type IService } from './services/service';
import { type IStatefulService } from './services/statefulService';

export namespace initialization {
  export const serviceModules = import.meta.glob<Record<string, unknown>>(
    [
      './services/**/*.ts',
      '!./services/services/**',
      '!./services/**/__tests__/**',
      '!./services/**/__mock__/**',
    ],
    { eager: true },
  );
  export const actionModules = import.meta.glob<Record<string, unknown>>(
    [
      './actions/**/*.ts',
      '!./actions/**/__tests__/**',
      '!./actions/**/__mocks__/**',
    ],
    { eager: true },
  );

  export const services = new ServiceRegistry(serviceModules);
  export const context = new ContextStore();
  export const actions = new ActionRegistry(services, context, actionModules);

  export const Platform = {
    services,
    context,
    actions,
  };

  export const PlatformContext = createContext(Platform);
  export const PlatformProvider = PlatformContext.Provider;

  export function useService<T extends IService>(serviceId: string): T {
    const platform = useContext(PlatformContext);
    return platform.services.get(serviceId) as T;
  }

  export function useSnapshot<T>(serviceId: string): T {
    const platform = useContext(PlatformContext);
    const service: IStatefulService = platform.services.get(serviceId);
    const getSnapshot = service.getSnapshot.bind(service);
    return useSyncExternalStore(
      service.subscribe,
      getSnapshot,
      getSnapshot,
    ) as T;
  }

  export function usePlatform() {
    return useContext(PlatformContext);
  }
}

export * from './services';
export default initialization.Platform;
export const PlatformContext = initialization.PlatformContext;
export const PlatformProvider = initialization.PlatformProvider;
export const useService = initialization.useService;
export const usePlatform = initialization.usePlatform;
export const useSnapshot = initialization.useSnapshot;
