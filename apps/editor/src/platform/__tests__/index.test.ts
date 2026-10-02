import { describe, expect, it } from "vitest";
import { ActionRegistry } from "../actions";
import { ContextStore } from "../context";
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

    expect(Platform.services.get("global.logger")).toBeInstanceOf(
      LoggerService,
    );
    expect(Platform.services.get("global.filesystem")).toBeInstanceOf(
      FileSystemService,
    );
    expect(Platform.services.get("global.document")).toBeInstanceOf(
      DocumentService,
    );
  });

  it("constructs a document service and initializes a new document", () => {
    const docService =
      Platform.services.get<DocumentService>("global.document");
    expect(docService).toBeInstanceOf(DocumentService);

    docService.new();
    expect(docService.isDirty()).toBe(false);
  });
});
