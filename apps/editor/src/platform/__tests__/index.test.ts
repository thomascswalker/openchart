import { describe, expect, it } from "vitest";
import { ActionRegistry } from "../actions";
import { ContextStore } from "../context";
import Platform from "../index";
import { ServiceRegistry } from "../services";
import { DocumentService } from "../../services/document";
import { FileSystemService } from "../../services/filesystem";
import { LoggerService } from "../../services/logger";
import { SettingsService } from "../../services/settings";

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
    expect(Platform.services.get("settings")).toBeInstanceOf(SettingsService);

    const serviceIds = [
      "document",
      "editor.active-chart-view",
      "editor.clipboard",
      "editor.state",
      "editor.viewports",
      "filesystem",
      "logger",
      "playback",
      "settings",
    ];
    expect(
      serviceIds.filter((id) => !Platform.services.hasService(id)),
    ).toEqual([]);
    expect(Platform.actions.hasAction("document.save")).toBe(true);
  });

  it("constructs a document service and initializes a new document", () => {
    const docService = Platform.services.get<DocumentService>("document");
    expect(docService).toBeInstanceOf(DocumentService);

    docService.reset();
    expect(docService.isDirty()).toBe(false);
  });
});
