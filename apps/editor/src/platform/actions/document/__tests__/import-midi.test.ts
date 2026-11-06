import { Midi } from '@openchart/midi';
import { describe, expect, it, vi } from 'vitest';

import { mockLoggerService } from '../../../services/__mock__/logger.mock';
import { DocumentService } from '../../../services/document/document';
import { makeDefaultMetadata } from '../../../services/document/schema';
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
    const document = new DocumentService(
      logger,
      createTestRulesetService(),
      mockWorkspaceService(),
    );
    document.init();
    document.metadata = metadata;
    const read = vi.fn(async () => ({
      name: 'imported.mid',
      bytes: importedMidi.toBuffer(),
      handle: null,
    }));
    const services = {
      document,
      filesystem: { read },
      logger,
    };
    const accessor: ServicesAccessor = {
      get: <T>(id: string) => services[id as keyof typeof services] as T,
    };

    await new ImportMidiAction().run(accessor);

    expect(read).toHaveBeenCalledOnce();
    expect(document.getSnapshot().data?.trackCount).toBe(1);
    expect(document.metadata).toEqual(metadata);
    expect(document.isDirty).toBe(true);
    expect(logger.info).toHaveBeenCalledWith('MIDI imported: imported.mid');
  });
});
