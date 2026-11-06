import { Midi } from '@openchart/midi';
import { describe, expect, it, vi } from 'vitest';

import { mockLoggerService } from '../../../services/__mock__/logger.mock';
import { ProjectService } from '../../../services/project/project';
import { makeDefaultMetadata } from '../../../services/project/schema';
import type { ServicesAccessor } from '../../../services/registry';
import { createTestRulesetService } from '../../../services/ruleset/__tests__/testUtils';
import { mockWorkspaceService } from '../../../services/workspace/__tests__/utils';
import { ImportMidiAction } from '../import-midi';

describe('ImportMidiAction', () => {
  it('replaces the current MIDI while preserving project metadata', async () => {
    const importedMidi = new Midi();
    importedMidi.addTrack();
    const metadata = makeDefaultMetadata();
    metadata.song.name = 'Keep this metadata';

    const logger = mockLoggerService();
    const project = new ProjectService(
      logger,
      createTestRulesetService(),
      mockWorkspaceService(),
    );
    project.init();
    project.metadata = metadata;
    const read = vi.fn(async () => ({
      name: 'imported.mid',
      bytes: importedMidi.toBuffer(),
      handle: null,
    }));
    const services = {
      project,
      filesystem: { read },
      logger,
    };
    const accessor: ServicesAccessor = {
      get: <T>(id: string) => services[id as keyof typeof services] as T,
    };

    await new ImportMidiAction().run(accessor);

    expect(read).toHaveBeenCalledOnce();
    expect(project.getSnapshot().data?.trackCount).toBe(1);
    expect(project.metadata).toEqual(metadata);
    expect(project.isDirty).toBe(true);
    expect(logger.info).toHaveBeenCalledWith('MIDI imported: imported.mid');
  });
});
