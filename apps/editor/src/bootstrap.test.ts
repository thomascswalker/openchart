import { afterEach, describe, expect, it, vi } from "vitest";
import { bootstrap } from "./bootstrap";
import Platform from "./platform";
import { AudioService } from "./services/audio";
import { DocumentService } from "./services/document";
import { EditorStateService } from "./services/editor/state";
import { ViewportService } from "./services/editor/viewports";

describe("bootstrap", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resets application services before initializing audio without React", () => {
    const audio = Platform.services.get<AudioService>("audio");
    const editorState =
      Platform.services.get<EditorStateService>("editor.state");
    const document = Platform.services.get<DocumentService>("document");
    const viewports = Platform.services.get<ViewportService>(
      "editor.viewports",
    );

    const resetEditorState = vi
      .spyOn(editorState, "reset")
      .mockImplementation(() => {});
    const resetDocument = vi.spyOn(document, "reset").mockImplementation(() => {});
    const resetViewports = vi
      .spyOn(viewports, "reset")
      .mockImplementation(() => {});
    const initializeAudio = vi
      .spyOn(audio, "initialize")
      .mockResolvedValue();

    bootstrap();

    expect(resetEditorState).toHaveBeenCalledOnce();
    expect(resetDocument).toHaveBeenCalledOnce();
    expect(resetViewports).toHaveBeenCalledOnce();
    expect(initializeAudio).toHaveBeenCalledOnce();
    expect(resetEditorState.mock.invocationCallOrder[0]).toBeLessThan(
      initializeAudio.mock.invocationCallOrder[0]!,
    );
    expect(resetDocument.mock.invocationCallOrder[0]).toBeLessThan(
      initializeAudio.mock.invocationCallOrder[0]!,
    );
    expect(resetViewports.mock.invocationCallOrder[0]).toBeLessThan(
      initializeAudio.mock.invocationCallOrder[0]!,
    );
  });
});
