import { it, expect, describe, beforeEach, afterEach } from "vitest";
import mock from "mock-fs";
import {
  getOriginPrivateDirectory,
  FileSystemDirectoryHandle,
} from "native-file-system-adapter";
import nodeAdapter from "native-file-system-adapter/src/adapters/node.js";
import { FileTreeModel } from "../fileTree";

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

describe("FileTreeModel", () => {
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

  it("should initialize with a root when provided", async () => {
    const tree = new FileTreeModel(root);
    await tree.refresh();
    expect(tree.get()).toBeDefined();
    expect(tree.find("dir1")).toBeDefined();
    expect(tree.find("dir1/dir2")).toBeDefined();
    expect(tree.find("dir1/dir2/file4.txt")).toBeDefined();
    expect(tree.find("dir1/file1.txt")).toBeDefined();
    expect(tree.find("file2.txt")).toBeDefined();
    expect(tree.find("file3.txt")).toBeDefined();
  });

  it("refresh discovers new files", async () => {
    const tree = new FileTreeModel(root);
    await tree.refresh();
    expect(tree.find("dir1/dir2/file4.txt")).toBeDefined();

    // Create a new file in dir2
    const dir2Node = tree.findAs<FileSystemDirectoryHandle>("dir1/dir2");
    expect(dir2Node).toBeDefined();
    if (!dir2Node) {
      throw new Error("dir2 not found");
    }
    const fileHandle = await dir2Node.element.getFileHandle("my-new-file.txt", {
      create: true,
    });
    const writeable = await fileHandle.createWritable();
    await writeable.write("my new file content");
    await writeable.close();

    await tree.refresh();
    expect(tree.find("dir1/dir2/my-new-file.txt")).toBeDefined();
  });
});
