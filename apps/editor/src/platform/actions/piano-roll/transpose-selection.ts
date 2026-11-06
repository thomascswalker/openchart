import {
  DomainCommandType,
  EditCommandType,
  EditingModeId,
} from '@openchart/views';

import { Action } from '../../actions';
import type { EditingService } from '../../services/editor/editing';
import type { ServicesAccessor } from '../../services/registry';
import { parseSelectedNoteEntityIds } from './util';

/** Transposes selected notes through the active editing session. */
export class TransposeSelectionAction extends Action<[number]> {
  constructor() {
    super({
      condition: {
        'viewport.active-view': 'piano-roll',
        'editing.can.MOVE_SELECTION': true,
      },
    });
  }

  run(accessor: ServicesAccessor, semitones: number): void {
    const session = accessor
      .get<EditingService>('editor.editing')
      .getActiveSession();
    if (!session) {
      return;
    }
    const targetIds = parseSelectedNoteEntityIds(
      session.selection.getSelectedIds(),
    );
    if (targetIds.length === 0) {
      return;
    }
    switch (session.mode.id) {
      case EditingModeId.MidiVocals:
        session.execute({
          type: DomainCommandType.MoveVocalEntities,
          targetIds,
          tickDelta: 0,
          pitchDelta: semitones,
          previousValidTickDelta: 0,
        });
        break;
      default:
        session.execute({
          type: EditCommandType.MoveNotes,
          targetIds,
          tickDelta: 0,
          pitchDelta: semitones,
        });
        break;
    }
  }
}
