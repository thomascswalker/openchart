import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { DocumentService } from "../../services/document";
import { LoggerService } from "../../services/logger";
import { MixerService } from "../../services/mixer";
import { ApplyProjectMetadataAction } from "./apply-project-metadata";

export class OpenDocumentAction extends Action {
  async run(accessor: ServicesAccessor): Promise<void> {
    const logger = accessor.get<LoggerService>("logger");
    const document = accessor.get<DocumentService>("document");

    if (
      document.isDirty &&
      !window.confirm(
        "This document has unsaved changes. Discard them and continue?",
      )
    ) {
      logger.error("Exiting file open");
      return;
    }

    try {
      const opened = await document.open();
      if (!opened) {
        return;
      }

      accessor.get<MixerService>("mixer").reset();
      const issues = await new ApplyProjectMetadataAction().run(
        accessor,
        document.metadata,
        true,
      );
      if (issues.length > 0) {
        throw new Error(
          issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"),
        );
      }
      document.isDirty = false;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === "AbortError") {
          logger.debug("Closed open file dialog");
          return;
        }
        logger.error(`An error occurred: ${error.message}`);
      }
      throw error;
    }
  }
}
