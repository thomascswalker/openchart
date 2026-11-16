import { describe, expect, it, vi } from 'vitest';

import {
  MetadataSchema,
  makeDefaultMetadata,
} from '../../../services/project/schema';
import type { ServicesAccessor } from '../../../services/registry';
import { OpenProjectAction } from '../open';

describe('OpenProjectAction', () => {
  it('resets audio and reloads the project metadata audio paths', async () => {
    const root = {} as FileSystemDirectoryHandle;
    const metadata = makeDefaultMetadata();
    metadata.audio.root = 'stems';
    metadata.audio.lead = 'lead.wav';
    const project = {
      isDirty: false,
      open: vi.fn(async () => true),
      metadata,
      metadataSchema: MetadataSchema,
      getSnapshot: () => ({ directoryHandle: root }),
    };
    const removeTrack = vi.fn();
    const addTrack = vi.fn().mockResolvedValue(undefined);
    const mixer = {
      reset: vi.fn(),
      removeTrack,
      addTrack,
    };
    const services = {
      logger: { info: vi.fn(), error: vi.fn() },
      project,
      mixer,
      'editor.state': { clearError: vi.fn(), setError: vi.fn() },
    };
    const accessor: ServicesAccessor = {
      get: <T>(id: string) => services[id as keyof typeof services] as T,
    };

    await new OpenProjectAction().run(accessor);

    expect(project.open).toHaveBeenCalledOnce();
    expect(mixer.reset).toHaveBeenCalledOnce();
    expect(removeTrack).toHaveBeenCalledWith('lead');
    expect(addTrack).toHaveBeenCalledWith('lead', 'lead.wav', root, 'stems');
    expect(project.isDirty).toBe(false);
  });
});
