import Platform from "../../platform";
import { IService } from "../../platform/services";
import { ActiveChartViewService } from "./activeChartView";

export interface ClipboardView {
  canCopySelection: () => boolean;
  canCutSelection: () => boolean;
  canPasteClipboard: () => boolean;
  copySelection: () => void;
  cutSelection: () => void;
  pasteClipboard: () => void;
}

export class EditorClipboardService extends IService {
  static dependencies = ["editor.active-chart-view"];
  private readonly activeChartView: ActiveChartViewService;

  constructor(activeChartView: ActiveChartViewService) {
    super();
    this.activeChartView = activeChartView;
    this.activeChartView.subscribe(() => this.sync());
  }

  public readonly reset = (): void => this.sync();

  private get view(): ClipboardView | null {
    return this.activeChartView.getSnapshot();
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
    this.notify();
  }
}
