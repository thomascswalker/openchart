import { it, expect, describe, beforeEach, afterEach } from "vitest";
import { FileTree } from "../tree";
import type { IDirectoryNode } from "../tree";
import mock from "mock-fs";
import {
  getOriginPrivateDirectory,
  FileSystemDirectoryHandle,
} from "native-file-system-adapter";
import nodeAdapter from "native-file-system-adapter/src/adapters/node.js";

async function getDirectory(path: string) {
  return getOriginPrivateDirectory(nodeAdapter, path);
}

const FileSystem = {
  __root__: {
    dir1: {
      dir2: {
        "file4.txt": "content4",
      },
      "file1.txt": "content",
    },
    "file2.txt": "content2",
    "file3.txt": "content3",
  },
} as const;

describe("FileTree", () => {
  let root: FileSystemDirectoryHandle;

  beforeEach(async () => {
    mock(FileSystem);
    await getDirectory("__root__").then((dir) => {
      root = dir;
    });
  });
  afterEach(() => {
    mock.restore();
  });

  it("should initialize with an empty root", () => {
    const tree = new FileTree();
    expect(tree.has("__root__")).toBe(false);
  });

  it("should initialize with a root when provided", async () => {
    const tree = await FileTree.create(root);
    expect(tree.has("__root__")).toBe(true);
    expect(tree.has("dir1")).toBe(true);
    expect(tree.has("dir1/dir2")).toBe(true);
    expect(tree.has("dir1/dir2/file4.txt")).toBe(true);
    expect(tree.has("dir1/file1.txt")).toBe(true);
    expect(tree.has("file2.txt")).toBe(true);
    expect(tree.has("file3.txt")).toBe(true);
  });

  it("refresh discovers new files", async () => {
    const tree = await FileTree.create(root);
    expect(tree.has("dir1/dir2/file4.txt")).toBe(true);

    // Create a new file in dir2
    const dir2 = tree.getAs<IDirectoryNode>("dir1/dir2")!;
    const fileHandle = await dir2.handle.getFileHandle("my-new-file.txt", {
      create: true,
    });
    const writeable = await fileHandle.createWritable();
    await writeable.write("my new file content");
    await writeable.close();

    await tree.refresh();
    expect(tree.has("dir1/dir2/my-new-file.txt")).toBe(true);
  });
});
