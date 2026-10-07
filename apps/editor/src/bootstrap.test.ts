import { afterEach, describe, expect, it, vi } from "vitest";
import { bootstrap } from "./bootstrap";
import Platform from "./platform";
import { DocumentService } from "./services/document";
import { EditorStateService } from "./services/editor/state";
import { ViewportService } from "./services/editor/viewports";

describe("bootstrap", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resets application services without React", () => {
    const editorState =
      Platform.services.get<EditorStateService>("editor.state");
    const document = Platform.services.get<DocumentService>("document");
    const viewports =
      Platform.services.get<ViewportService>("editor.viewports");

    const resetEditorState = vi
      .spyOn(editorState, "reset")
      .mockImplementation(() => {});
    const resetDocument = vi
      .spyOn(document, "reset")
      .mockImplementation(() => {});
    const resetViewports = vi
      .spyOn(viewports, "reset")
      .mockImplementation(() => {});
    bootstrap();

    expect(resetEditorState).toHaveBeenCalledOnce();
    expect(resetDocument).toHaveBeenCalledOnce();
    expect(resetViewports).toHaveBeenCalledOnce();
  });
});
