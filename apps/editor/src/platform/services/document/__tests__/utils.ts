import { vi } from "vitest";
import { mockLoggerService } from "../../__mock__/logger.mock";
import { createTestRulesetService } from "../../ruleset/__tests__/testUtils";
import {
  type OpenedProject,
  DocumentService,
} from "../document";

export function makeDocumentService(
  openedProject?: OpenedProject,
): DocumentService {
  const service = new DocumentService(
    mockLoggerService(),
    createTestRulesetService(),
  );

  if (openedProject) {
    Object.assign(service, {
      readProject: vi.fn(async () => openedProject),
    });
  }
  return service;
}
