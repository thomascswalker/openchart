import { Subscriber } from "../subscriber";
import {
  FileSystemDirectoryHandle,
  FileSystemFileHandle,
} from "native-file-system-adapter";

const RootNodeId = "__root__";

export interface INode {
  id: string;
  parentId?: string;
  children?: Map<string, INode>;
  readonly depth: number;
}

export interface IFileNode extends INode {
  handle: FileSystemFileHandle;
}

export interface IDirectoryNode extends INode {
  handle: FileSystemDirectoryHandle;
  children: Map<string, ITreeNode>;
}

export type ITreeNode = IFileNode | IDirectoryNode;

type NodePredicate = (node: ITreeNode) => boolean;

/**
 * Represents a file tree structure that allows managing and querying files
 * and directories.
 */
class FileTree extends Subscriber {
  #rootNode?: IDirectoryNode = undefined;
  #nodes: Map<string, ITreeNode> = new Map();

  constructor() {
    super();
  }

  static async create(rootHandle: FileSystemDirectoryHandle) {
    const tree = new FileTree();
    if (rootHandle) {
      await tree.setRootHandle(rootHandle);
    }
    return tree;
  }

  isValid(): boolean {
    return this.#rootNode !== undefined;
  }

  /**
   * Sets the root directory handle for the file tree and initializes the tree
   *  structure.
   *
   * @param rootHandle The root directory handle to set.
   * @returns A promise that resolves when the root handle has been set and the tree has been initialized.
   */
  async setRootHandle(rootHandle: FileSystemDirectoryHandle | undefined) {
    if (rootHandle) {
      const rootNode = {
        id: RootNodeId,
        handle: rootHandle,
        children: new Map<string, ITreeNode>(),
        depth: 0,
      } as IDirectoryNode;
      this.#rootNode = rootNode;
      this.#nodes.set(rootNode.id, rootNode);
      await this.#discover(rootNode);
    }
  }

  /**
   * Recursively discovers all children of the given directory node and
   * populates the children map.
   *
   * @param parent The directory node whose children are to be discovered.
   * @returns A promise that resolves when all children have been discovered.
   */
  async #discover(parent: IDirectoryNode): Promise<void> {
    // Initialize the children map for the parent directory node.
    parent.children = new Map<string, ITreeNode>();

    // Iterate over each entry in the directory handle.
    for await (const [name, handle] of parent.handle.entries() ?? []) {
      const nodeId = parent.id != RootNodeId ? `${parent.id}/${name}` : name;
      switch (handle.kind) {
        // Handle file entries
        case "file":
          const fileNode = {
            id: nodeId,
            handle,
            parentId: parent.id,
            depth: parent.depth + 1,
          } as IFileNode;
          this.#nodes.set(fileNode.id, fileNode);
          parent.children.set(name, fileNode);
          break;

        // Handle directory entries by recursively discovering their children.
        case "directory":
          const dirNode = {
            id: nodeId,
            handle,
            children: new Map<string, ITreeNode>(),
            parentId: parent.id,
            depth: parent.depth + 1,
          } as IDirectoryNode;
          await this.#discover(dirNode);
          this.#nodes.set(dirNode.id, dirNode);
          parent.children.set(name, dirNode);
          break;
      }
    }
  }

  /**
   * Refreshes the file tree by rediscovering all nodes starting from the root.
   */
  async refresh(): Promise<void> {
    if (!this.#rootNode) {
      return;
    }
    await this.#discover(this.#rootNode);
  }

  /**
   * Gets a node in the file tree based on the given path.
   *
   * @param path The path to the node, relative to the root.
   * @returns The tree node if found, otherwise undefined.
   */
  get(path: string): ITreeNode | undefined {
    if (!this.#rootNode) {
      return undefined;
    }
    return this.#nodes.get(path);
  }

  /**
   * Gets a node in the file tree and casts it to the specified type.
   *
   * @param path The path to the node, relative to the root.
   * @returns The tree node cast to the specified type if found, otherwise
   * undefined.
   */
  getAs<T extends ITreeNode>(path: string): T | undefined {
    return this.get(path) as T | undefined;
  }

  /**
   * Checks if a node exists in the file tree based on the given path.
   *
   * @param path The path to the node, relative to the root.
   * @returns True if the node exists, otherwise false.
   */
  has(path: string): boolean {
    return this.#nodes.has(path);
  }

  /**
   * Filters the nodes in the file tree based on the given predicate.

   * @param predicate The function used to test each node.
   * @returns An array of tree nodes that satisfy the predicate.
   */
  filter(predicate: NodePredicate): ITreeNode[] {
    return Array.from(this.#nodes.values()).filter(predicate);
  }
}

export { FileTree };
