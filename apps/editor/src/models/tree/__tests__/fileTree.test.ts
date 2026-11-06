import mock from 'mock-fs';
import { getOriginPrivateDirectory } from 'native-file-system-adapter';
import nodeAdapter from 'native-file-system-adapter/src/adapters/node.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FileTreeModel } from '../fileTree';

async function getDirectory(path: string) {
  return getOriginPrivateDirectory(nodeAdapter, path);
}

const FileSystem = {
  __root__: {
    dir1: {
      dir2: {
        'file4.txt': 'content4',
      },
      'file1.txt': 'content',
    },
    'file2.txt': 'content2',
    'file3.txt': 'content3',
  },
} as const;

describe('FileTreeModel', () => {
  let root: FileSystemDirectoryHandle;

  beforeEach(async () => {
    mock(FileSystem);
    await getDirectory('__root__').then((dir) => {
      root = dir as unknown as FileSystemDirectoryHandle;
    });
  });
  afterEach(() => {
    mock.restore();
  });

  it('should initialize with a root when provided', async () => {
    const tree = new FileTreeModel(root);
    await tree.refresh();
    expect(tree.get()).toBeDefined();
    expect(tree.find('dir1')).toBeDefined();

    const dir1Node = tree.find('dir1');
    expect(dir1Node).toBeDefined();
    if (!dir1Node) {
      throw new Error('dir1 not found');
    }
    tree.expand(dir1Node);
    await vi.waitFor(() => {
      expect(tree.find('dir1/dir2')).toBeDefined();
    });

    expect(
      Array.from(tree.nodes.values()).map((node) => node.element.name),
    ).toEqual(['', 'dir1', 'dir2', 'file1.txt', 'file2.txt', 'file3.txt']);

    const discoveredDir2Node = tree.find('dir1/dir2');
    expect(discoveredDir2Node).toBeDefined();
    if (!discoveredDir2Node) {
      throw new Error('dir1/dir2 not found');
    }
    tree.expand(discoveredDir2Node);
    await vi.waitFor(() => {
      expect(tree.find('dir1/dir2/file4.txt')).toBeDefined();
    });
    expect(tree.find('dir1/dir2')).toBeDefined();
    expect(tree.find('dir1/dir2/file4.txt')).toBeDefined();
    expect(tree.find('dir1/file1.txt')).toBeDefined();
    expect(tree.find('file2.txt')).toBeDefined();
    expect(tree.find('file3.txt')).toBeDefined();
  });

  it('refresh discovers new files', async () => {
    const tree = new FileTreeModel(root);
    await tree.refresh();
    expect(tree.find('dir1/dir2/file4.txt')).toBeUndefined();

    const dir1Node = tree.find('dir1');
    expect(dir1Node).toBeDefined();
    if (!dir1Node) {
      throw new Error('dir1 not found');
    }
    tree.expand(dir1Node);
    await vi.waitFor(() => {
      expect(tree.find('dir1/dir2')).toBeDefined();
    });
    const nestedDir2Node = tree.find('dir1/dir2');
    expect(nestedDir2Node).toBeDefined();
    if (!nestedDir2Node) {
      throw new Error('dir1/dir2 not found');
    }
    tree.expand(nestedDir2Node);
    await vi.waitFor(() => {
      expect(tree.find('dir1/dir2/file4.txt')).toBeDefined();
    });

    // Create a new file in dir2
    const dir2Node = tree.findAs<FileSystemDirectoryHandle>('dir1/dir2');
    expect(dir2Node).toBeDefined();
    if (!dir2Node) {
      throw new Error('dir2 not found');
    }
    const fileHandle = await dir2Node.element.getFileHandle('my-new-file.txt', {
      create: true,
    });
    const writeable = await fileHandle.createWritable();
    await writeable.write('my new file content');
    await writeable.close();

    await tree.refresh();
    const refreshedDir1 = tree.find('dir1');
    expect(refreshedDir1).toBeDefined();
    if (!refreshedDir1) {
      throw new Error('dir1 not found after refresh');
    }
    tree.expand(refreshedDir1);
    await vi.waitFor(() => {
      expect(tree.find('dir1/dir2')).toBeDefined();
    });
    const refreshedDir2 = tree.find('dir1/dir2');
    expect(refreshedDir2).toBeDefined();
    if (!refreshedDir2) {
      throw new Error('dir1/dir2 not found after refresh');
    }
    tree.expand(refreshedDir2);
    await vi.waitFor(() => {
      expect(tree.find('dir1/dir2/my-new-file.txt')).toBeDefined();
    });
    expect(tree.find('dir1/dir2/my-new-file.txt')).toBeDefined();
  });
});
