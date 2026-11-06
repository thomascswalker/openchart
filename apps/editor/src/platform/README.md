# Platform

The _backend_, so to speak, of the editor revolves around **services**,
**actions**, and **contexts** (not to be confused with React contexts).

- [Services](#services)
- [Actions](#actions)
- [Context](#context)

All three of these concepts are initialized when the application starts,
ultimately triggered by importing [`index.ts`](./index.ts) during the
bootstrapping process.

## Services

**Services** are modular, reusable classes intended to provide a "global"
accessor for various features within the editor. They are dynamically
discovered, registered, and finally constructed when the application starts.

They are automatically discovered via the `ServiceRegistry`. It recursively
walks [`./services`](./services) to find classes which subclass `Service`,
excluding tests and mocks.

Services which are discovered have their constructors stored in the registry and
a single instance of the service is constructed and stored in a mapping of the
service ID to the instance object. The service ID is just the name of the module
the service is defined in.

Each service declares an `IFooService` interface and a matching parameter
decorator, `const IFooService = createDecorator<IFooService>("foo")`, where the
string is the service ID. Dependencies are requested by decorating constructor
parameters (`@IFooService private readonly fooService: IFooService`); the
constructor body only calls `super()`. Once a service and its dependencies are
constructed, the registry calls its `init()` method for any remaining setup that
requires those dependencies.

### Consuming a service

Services can be consumed in a number of ways:

The `run` function of an [`Action`](#actions) passes a `ServicesAccessor` which
is essentially just a map of services which are registered and available. This
allows any action to use any service as necessary all within the `run` function.

```ts
class MyAction extends Action {
  run(accessor: ServicesAccessor): void {
    const service = accessor.get<TService>('service-id');
  }
}
```

If a service is required inside a React component, you can use the `useService`
hook.

```tsx
const MyComponent = () => {
  const service = useService<TService>('service-id');
};
```

## Actions

**Actions** are explicit commands to perform within the editor.

They are automatically discovered via the `ActionRegistry`, similar to services.
The registry scans the [`./actions`](./actions) directory for classes that
extend the `Action` base class, excluding tests and mocks. Once discovered,
actions can be executed by the editor as needed.

### Defining an action

Actions extend the base `Action` class. They implement a `run` method which
receives a `ServicesAccessor` and any arguments defined for the action.

```ts
class MyAction extends Action {
  run(accessor: ServicesAccessor): void {
    const service = accessor.get<TService>('service-id');
  }
}
```

Action arguments are defined using a tuple type which is then passed as a
generic parameter to the `Action` class.

```ts
type MyOtherActionArgs = [string, number];
class MyOtherAction extends Action<MyOtherActionArgs> {
  run(accessor: ServicesAccessor, arg1: string, arg2: number): void {
    const service = accessor.get<TService>('service-id');
  }
}
```

Actions can be either synchronous or asynchronous. Synchronous actions return
`void`, while asynchronous actions return a `Promise<void>`.

```ts
class MyAsyncAction extends Action {
  async run(accessor: ServicesAccessor): Promise<void> {
    const service = accessor.get<TService>('service-id');
  }
}
```

Actions can return values if needed. The return type should be specified in the
`run` method's signature. For synchronous actions, this can be any type, while
for asynchronous actions, it should be a `Promise` of the desired type.

```ts
class MyReturningAction extends Action {
  run(accessor: ServicesAccessor): number {
    const service = accessor.get<TService>('service-id');
    return 42;
  }
}

class MyAsyncReturningAction extends Action {
  async run(accessor: ServicesAccessor): Promise<number> {
    const service = accessor.get<TService>('service-id');
    return 42;
  }
}
```

An action may also depend on certain conditions being met before it can execute.
This can be defined in the constructor when calling `super` with the
`ActionOptions` object. A condition is an object that specifies the required context flags that must be set for the action to execute.

```ts
class MyConditionalAction extends Action {
  constructor() {
    // The requisite condition for this action to execute is that the context
    // group "category" must have the "can-execute" flag set to true for this action to run.
    super({ condition: { 'category.can-execute': true } });
  }
}
```

## Context

The context system allows actions to specify conditions that must be met for
them to execute. Context flags are managed by the `ContextStore`, which provides
methods to set, get, update, and evaluate context values.

```ts
import { Platform } from '@src/platform';

Platform.context.set('category.can-execute', true);
Platform.context.get('category.can-execute');
```
