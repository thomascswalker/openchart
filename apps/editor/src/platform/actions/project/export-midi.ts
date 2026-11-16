import { Action } from '../../actions';
import { ProjectService } from '../../services/project/project';
import type { ServicesAccessor } from '../../services/registry';

export class ExportMidiAction extends Action {
  constructor() {
    super({ condition: { 'project.has-tracks': true } });
  }

  async run(accessor: ServicesAccessor): Promise<void> {
    const project = accessor.get<ProjectService>('project');

    // Ensure there is a MIDI project to export.
    const state = project.getSnapshot();
    if (!state.data?.trackCount) {
      throw new Error('There is no MIDI project to export.');
    }

    // Export the MIDI data and suggested file name from the project.
    const { bytes, suggestedName } = project.export();

    // Prepare the MIDI and project files for writing.
    const midiFile = { name: suggestedName, bytes, mimeType: 'audio/midi' };
    const projectFile = {
      name: 'info.json',
      bytes: new TextEncoder().encode(
        JSON.stringify(project.metadata, null, 2),
      ),
      mimeType: 'application/json',
    };

    // Write the prepared MIDI and project files to the project's storage.
    await project.writeFiles([midiFile, projectFile]);
  }
}
