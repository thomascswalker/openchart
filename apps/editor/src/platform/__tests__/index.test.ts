import { describe, expect, it } from "vitest";
import { Action, ActionRegistry } from "../actions";
import { ContextStore } from "../context";
import {
  registerDiscoveredActions,
  registerDiscoveredServices,
} from "../discovery";
import Platform from "../index";
import { ServiceRegistry } from "../services";
import { DocumentService } from "../../services/document";
import { FileSystemService } from "../../services/filesystem";
import { LoggerService } from "../../services/logger";

describe("Platform", () => {
  it("constructs the registries and registers the service classes", () => {
    expect(Platform.services).toBeInstanceOf(ServiceRegistry);
    expect(Platform.context).toBeInstanceOf(ContextStore);
    expect(Platform.actions).toBeInstanceOf(ActionRegistry);

    expect(Platform.actions.serviceRegistry).toBe(Platform.services);
    expect(Platform.actions.contextStore).toBe(Platform.context);

    expect(Platform.services.get("logger")).toBeInstanceOf(LoggerService);
    expect(Platform.services.get("filesystem")).toBeInstanceOf(
      FileSystemService,
    );
    expect(Platform.services.get("document")).toBeInstanceOf(DocumentService);
    expect(Platform.actions.hasAction("document.save")).toBe(true);
  });

  it("constructs a document service and initializes a new document", () => {
    const docService = Platform.services.get<DocumentService>("document");
    expect(docService).toBeInstanceOf(DocumentService);

    docService.new();
    expect(docService.isDirty()).toBe(false);
  });

  it("discovers actions by path and enforces action-level conditions", () => {
    class OpenAudioAction extends Action<[string], string> {
      constructor() {
        super({ condition: { "audio.available": true } });
      }

      run(
        _accessor: ReturnType<ServiceRegistry["createAccessor"]>,
        name: string,
      ) {
        return name.toUpperCase();
      }
    }

    const services = new ServiceRegistry();
    const context = new ContextStore();
    const registry = new ActionRegistry(services, context);
    registerDiscoveredActions(registry, {
      "../actions/audio/open.ts": { OpenAudioAction },
      "../actions/audio/open.test.ts": { OpenAudioAction },
    });

    expect(registry.hasAction("audio.open")).toBe(true);
    expect(registry.isAvailable("audio.open")).toBe(false);
    expect(() => registry.executeAction("audio.open", "song.wav")).toThrow(
      "not available",
    );
    context.set("audio.available", true);
    expect(registry.executeAction<string>("audio.open", "song.wav")).toBe(
      "SONG.WAV",
    );
  });

  it("discovers nested services and resolves path-derived dependencies", () => {
    class AudioConfigService {}
    let receivedConfig: AudioConfigService | undefined;
    class AudioService {
      static dependencies = ["audio.config"];

      constructor(config: AudioConfigService) {
        receivedConfig = config;
      }
    }

    const services = new ServiceRegistry();
    registerDiscoveredServices(services, {
      "../services/audio/service.ts": { AudioService },
      "../services/audio/config.ts": { AudioConfigService },
    });

    expect(services.hasService("audio.service")).toBe(true);
    expect(services.get<AudioService>("audio.service")).toBeInstanceOf(
      AudioService,
    );
    expect(receivedConfig).toBeInstanceOf(AudioConfigService);
  });
});
