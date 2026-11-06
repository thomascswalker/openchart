import { Midi } from '@openchart/midi';

import { Action } from '../../actions';
import type { FileSystemService } from '../../services/filesystem';
import { LoggerService } from '../../services/logger';
import { ProjectService } from '../../services/project/project';
import { MidiFilePickerTypes } from '../../services/project/types';
import type { ServicesAccessor } from '../../services/registry';

export class ImportMidiAction extends Action {
  async run(accessor: ServicesAccessor): Promise<void> {
    const logger = accessor.get<LoggerService>('logger');
    const project = accessor.get<ProjectService>('project');
    const fileSystem = accessor.get<FileSystemService>('filesystem');

    try {
      // Prompt the user to select a MIDI file for import.
      const imported = await fileSystem.read(MidiFilePickerTypes);
      if (!imported) return;
      if (!/\.(mid|midi)$/i.test(imported.name)) {
        throw new Error('Choose a MIDI file (.mid or .midi).');
      }
      // Load the selected MIDI file into the project.
      project.data = new Midi(imported.bytes);
      logger.info(`MIDI imported: ${imported.name}`);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        logger.info(`Closed MIDI import dialog: ${error.message}`);
        return;
      }
      if (error instanceof Error) logger.error(error.message);
      throw error;
    }
  }
}
