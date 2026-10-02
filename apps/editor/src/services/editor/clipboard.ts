import Platform from "../../platform";

export interface ClipboardView {
  canCopySelection: () => boolean;
  canCutSelection: () => boolean;
  canPasteClipboard: () => boolean;
  copySelection: () => void;
  cutSelection: () => void;
  pasteClipboard: () => void;
}

export class EditorClipboardService {
  private view: ClipboardView | null = null;

  public setView(view: ClipboardView | null): void {
    this.view = view;
  }

  public canCopy(): boolean {
    return this.view?.canCopySelection() ?? false;
  }

  public canCut(): boolean {
    return this.view?.canCutSelection() ?? false;
  }

  public canPaste(): boolean {
    return this.view?.canPasteClipboard() ?? false;
  }

  public copy(): void {
    this.view?.copySelection();
  }

  public cut(): void {
    this.view?.cutSelection();
  }

  public paste(): void {
    this.view?.pasteClipboard();
  }

  public sync(): void {
    Platform.context.set("clipboard.can-copy", this.canCopy());
    Platform.context.set("clipboard.can-cut", this.canCut());
    Platform.context.set("clipboard.can-paste", this.canPaste());
  }
}
