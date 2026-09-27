import { Midi } from "@midiedit/core";
import { createProjectMetadata } from "../project/projectMetadata";
import type { EditorCommandCallback } from "./command";

export const executeNewFile: EditorCommandCallback = (context) => {
  if (
    context.isDirty &&
    !window.confirm(
      "This document has unsaved changes. Discard them and continue?",
    )
  ) {
    return;
  }
  context.setMidiData(new Midi());
  context.setProjectMetadata(createProjectMetadata());
  context.setFileName(null);
  context.setFileHandle(null);
  context.setIsDirty(false);
};
