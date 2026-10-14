import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { DocumentService } from "../../services/document/document";

/** Abandons the open edit transaction (e.g. Escape on a new note's lyric). */
export class RollbackOpenChartAction extends Action<[], boolean> {
  constructor() {
    super({});
  }

  run(accessor: ServicesAccessor): boolean {
    return accessor.get<DocumentService>("document").rollbackOpenChart();
  }
}
