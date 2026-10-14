import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { DocumentService } from "../../services/document";
import { LoggerService } from "../../services/logger";

export class OpenDocumentAction extends Action {
  constructor() {
    super({});
  }

  async run(accessor: ServicesAccessor): Promise<void> {
    const logger = accessor.get<LoggerService>("logger");
    const document = accessor.get<DocumentService>("document");

    if (
      document.isDirty() &&
      !window.confirm(
        "This document has unsaved changes. Discard them and continue?",
      )
    ) {
      logger.error("Exiting file open");
      return;
    }

    try {
      await document.open();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        logger.info("Closed open file dialog");
        return;
      }
      if (error instanceof Error) {
        logger.error(error.message);
      }
      throw error;
    }
  }
}
