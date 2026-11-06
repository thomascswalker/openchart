import { Midi } from '@openchart/midi';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type OpenedProject } from '../document';
import { makeDefaultMetadata } from '../schema';
import { makeDocumentService } from './utils';

describe('DocumentService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('owns MIDI data, project metadata, dirty state, and history', () => {
    const service = makeDocumentService();
    const midi = new Midi();
    midi.addTrack();
    service.data = midi;
    service.isDirty = false;

    midi.tracks[0]?.addNote(60, 0, 100, 120);
    service.recordEdit();
    expect(service.getSnapshot().canUndo).toBe(true);
    expect(service.getSnapshot().isDirty).toBe(true);

    service.undoEdit();
    expect(service.getSnapshot().data?.tracks[0]?.getNotes()).toHaveLength(0);
    expect(service.getSnapshot().canRedo).toBe(true);
  });

  it('does not dirty an empty edit transaction', () => {
    const service = makeDocumentService();
    service.isDirty = false;
    service.beginEdit();
    service.endEdit();

    expect(service.getSnapshot().isDirty).toBe(false);
    expect(service.getSnapshot().canUndo).toBe(false);
  });

  it('opens metadata JSON with adjacent notes.mid', async () => {
    const midi = new Midi();
    midi.addTrack();
    const metadataHandle = { name: 'info.json' } as FileSystemFileHandle;
    const midiHandle = { name: 'notes.mid' } as FileSystemFileHandle;
    const directoryHandle = {} as FileSystemDirectoryHandle;
    const metadata = makeDefaultMetadata();
    metadata.song.name = 'Opened project';

    const openedProject: OpenedProject = {
      projectHandle: metadataHandle,
      projectBytes: new TextEncoder().encode(JSON.stringify(metadata)),
      midiHandle,
      midiBytes: midi.toBuffer() as Uint8Array<ArrayBuffer>,
      directoryHandle,
    };

    const service = makeDocumentService(openedProject);
    await expect(service.open()).resolves.toBe(true);

    const snapshot = service.getSnapshot();
    expect(snapshot.data?.trackCount).toBe(1);
    expect(snapshot.midiFileHandle?.name).toBe('notes.mid');
    expect(snapshot.projectFileHandle?.name).toBe('info.json');
    expect(snapshot.directoryHandle).toBe(directoryHandle);
    expect(snapshot.metadata).toEqual(metadata);
    expect(snapshot.isDirty).toBe(false);
  });

  it('saves MIDI and metadata using state owned by the document', async () => {
    const midi = new Midi();
    midi.addTrack();
    const writtenFiles = new Map<string, Uint8Array>();
    const directoryHandle = {
      async getFileHandle(name: string) {
        return {
          name,
          async createWritable() {
            let bytes = new Uint8Array();
            return {
              async write(value: ArrayBuffer) {
                bytes = new Uint8Array(value);
              },
              async close() {
                writtenFiles.set(name, bytes);
              },
            };
          },
        };
      },
    } as unknown as FileSystemDirectoryHandle;
    const service = makeDocumentService();
    service.data = midi;
    service.rebind(
      { name: 'notes.mid' } as unknown as FileSystemFileHandle,
      directoryHandle,
    );

    await expect(service.save()).resolves.toBe(true);

    expect(writtenFiles.get('notes.mid')).toEqual(midi.toBuffer());
    expect(
      JSON.parse(new TextDecoder().decode(writtenFiles.get('info.json'))),
    ).toEqual(service.metadata);
    expect(service.getSnapshot()).toMatchObject({
      midiFileHandle: { name: 'notes.mid' },
      projectFileHandle: { name: 'info.json' },
      directoryHandle,
      isDirty: false,
    });
  });

  it('loads info.json and notes.mid from the selected project directory', async () => {
    const projectBytes = new TextEncoder().encode('{}');
    const midiBytes = new Uint8Array([0x4d, 0x54, 0x68, 0x64]);

    const projectHandle = {
      name: 'info.json',
      async getFile() {
        return {
          name: 'info.json',
          arrayBuffer: async () => projectBytes.slice().buffer,
        } as File;
      },
    } as unknown as FileSystemFileHandle;
    const midiHandle = {
      name: 'notes.mid',
      async getFile() {
        return {
          name: 'notes.mid',
          arrayBuffer: async () => midiBytes.slice().buffer,
        } as File;
      },
    } as unknown as FileSystemFileHandle;
    const directoryHandle = {
      getFileHandle: vi.fn(async () => midiHandle),
    } as unknown as FileSystemDirectoryHandle;
    const showOpenFilePicker = vi.fn(async () => [projectHandle]);
    vi.stubGlobal('window', {
      showOpenFilePicker,
    });

    const service = makeDocumentService(undefined, directoryHandle);
    await expect(service.readProject()).resolves.toEqual({
      projectBytes,
      midiBytes,
      projectHandle,
      midiHandle,
      directoryHandle,
    });
    expect(showOpenFilePicker).toHaveBeenCalledWith({ multiple: false });
    expect(directoryHandle.getFileHandle).toHaveBeenCalledWith('notes.mid');
  });

  it('creates and writes the project files in the directory chosen by Save As', async () => {
    const midi = new Midi();
    midi.addTrack();
    const writtenFiles = new Map<string, Uint8Array>();
    const directoryHandle = {
      async getFileHandle(name: string) {
        return {
          name,
          async createWritable() {
            let bytes = new Uint8Array();
            return {
              async write(value: ArrayBuffer) {
                bytes = new Uint8Array(value);
              },
              async close() {
                writtenFiles.set(name, bytes);
              },
            };
          },
        };
      },
    } as unknown as FileSystemDirectoryHandle;
    vi.stubGlobal('window', {
      showDirectoryPicker: vi.fn(async () => directoryHandle),
    });
    const service = makeDocumentService();
    service.data = midi;

    await expect(service.saveAs()).resolves.toBe(true);

    expect([...writtenFiles.keys()]).toEqual(['notes.mid', 'info.json']);
    expect(writtenFiles.get('notes.mid')).toEqual(midi.toBuffer());
    expect(
      JSON.parse(new TextDecoder().decode(writtenFiles.get('info.json'))),
    ).toEqual(service.metadata);
  });
});
