# Platform

The _backend_, so to speak, of the editor revolves around **services** and **actions**.

## Services

**Services** are modular, reusable classes intended to provide a "global" accessor for various features within the editor. They are dynamically discovered, registered, and finally constructed when the application starts.

They are automatically discovered via the `ServiceRegistry`. It recursively walks `./services` in order to find any classes which subclass `Service`.

Services which are discovered have their constructors stored in the registry and a single instance of the service is constructed and stored in a mapping of the service ID to the instance object. The service ID is just the name of the module the service is defined in.

### Consuming a service

Services can be consumed in a number of ways:

The `run` function of an [`Action`](#actions) passes a `ServicesAccessor` which is essentially just a map of services which are registered and available. This allows any action to use any service as necessary all within the `run` function.

```ts
class MyAction extends Action {
    run(accessor: ServicesAccessor): {
        const service = accessor.get<TService>("service-id");
    }
}

```

If a service is required inside a React component, you can use the `useService` hook.

```tsx
const MyComponent = () => {
  const service = useService<TService>("service-id");
};
```

## Actions

**Actions** are explicit commands to perform within the editor. An action may:

- Take any number (including zero) of arguments.
- Execute other actions.
- Require some condition to be met in order to execute.
