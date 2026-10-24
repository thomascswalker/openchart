import {
  ChartDocument,
  ClipboardService,
  EditScratchpad,
  getPhrasePitch,
  SelectionModel,
  SongView,
  TransactionManager,
  type ChartEditAction,
  type EditablePhraseKind,
} from "@openchart/views";
import type { Midi } from "@openchart/midi";
import { Service } from "../../platform/services";
import { DocumentService } from "../document";

/** Owns the shared headless editing state for the current MIDI document. */
export class EditorEditingService extends Service {
  static dependencies = ["document"];

  public readonly selection = new SelectionModel();
  public readonly scratchpad = new EditScratchpad();
  public readonly clipboard: ClipboardService;

  private readonly documentService: DocumentService;
  private chartDocument: ChartDocument | null = null;
  private transactions: TransactionManager | null = null;
  private midi: Midi | null = null;
  private documentId = -1;

  constructor(documentService: DocumentService) {
    super();
    this.documentService = documentService;
    this.midi = documentService.data;
    this.documentId = documentService.getSnapshot().documentId;
    const chartDocument = this.createChartDocument(documentService.data);
    this.chartDocument = chartDocument;
    this.clipboard = new ClipboardService(
      chartDocument,
      this.selection,
      (trackIndex, pitch) => this.getPhraseType(trackIndex, pitch),
    );
    this.createTransactionManager();
    this.documentService.subscribe(this.syncDocument);
  }

  public readonly reset = (): void => {
    this.selection.clear();
    this.scratchpad.clear();
    this.clipboard.clear();
    this.syncDocument();
  };

  public getDocument(): ChartDocument {
    if (!this.chartDocument) {
      throw new Error("There is no MIDI document to edit.");
    }
    return this.chartDocument;
  }

  public dispatch = (action: ChartEditAction): boolean => {
    if (!this.transactions) {
      throw new Error("There is no MIDI document to edit.");
    }
    return this.transactions.dispatch(action);
  };

  public dispatchBatch = (actions: ChartEditAction[]): boolean => {
    if (!this.transactions) {
      throw new Error("There is no MIDI document to edit.");
    }
    return this.transactions.dispatchBatch(actions);
  };

  private readonly syncDocument = (): void => {
    const snapshot = this.documentService.getSnapshot();
    const midi = snapshot.midi;
    if (midi === this.midi && snapshot.documentId === this.documentId) return;

    const projectChanged = snapshot.documentId !== this.documentId;
    this.midi = midi;
    this.documentId = snapshot.documentId;
    this.chartDocument = midi ? this.createChartDocument(midi) : null;
    this.createTransactionManager();
    if (this.chartDocument) {
      this.clipboard.setDocument(this.chartDocument);
    }
    if (projectChanged) {
      this.selection.clear();
      this.scratchpad.clear();
      this.clipboard.clear();
    }
    this.notify();
  };

  private createChartDocument(midi: NonNullable<DocumentService["data"]>) {
    const song = new SongView(midi);
    const descriptors = song.getTrackDescriptors();
    const document = new ChartDocument(midi, (trackIndex, phraseType) => {
      const track = midi.tracks[trackIndex];
      const descriptor = descriptors.find((item) => item.name === track?.name);
      return descriptor ? getPhrasePitch(descriptor, phraseType) : null;
    });
    return document;
  }

  private createTransactionManager(): void {
    this.transactions = this.chartDocument
      ? new TransactionManager(this.chartDocument, {
          beginEdit: this.documentService.beginEdit,
          recordEdit: this.documentService.recordEdit,
          endEdit: this.documentService.endEdit,
        })
      : null;
  }

  private getPhraseType(
    trackIndex: number,
    pitch: number,
  ): EditablePhraseKind | null {
    const midi = this.documentService.data;
    const track = midi.tracks[trackIndex];
    if (!track) return null;
    const descriptor = new SongView(midi)
      .getTrackDescriptors()
      .find((item) => item.name === track.name);
    if (!descriptor) return null;

    for (const phraseType of [
      "stagepower",
      "solo",
      "vocal",
      "power-window",
    ] as const) {
      if (getPhrasePitch(descriptor, phraseType) === pitch) return phraseType;
    }
    return null;
  }
}
