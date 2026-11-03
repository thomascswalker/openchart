import { ObjectTreeModel } from "./objectTree";
import type { ITreeNode } from "./tree";
import {
  FileSystemDirectoryHandle,
  FileSystemFileHandle,
  FileSystemHandle,
} from "native-file-system-adapter";

type FileTreeNode = ITreeNode<FileSystemHandle>;

/**
 * Represents a file tree model that manages a hierarchical structure of file
 * system handles.
 */
export class FileTreeModel extends ObjectTreeModel<FileSystemHandle> {
  private cache = new Map<string, FileTreeNode>();

  constructor(root: FileSystemHandle) {
    if (root.kind !== "directory") {
      throw new Error("Root must be a directory handle");
    }
    super(root, {
      onRefresh: async (): Promise<void> => {
        await this.discover(this.root);
        this.buildCache();
      },
    });
  }

  /**
   * Builds a cache mapping full paths to their corresponding tree nodes. This
   * clears the existing cache and repopulates it based on the current state of
   * the tree.
   */
  private buildCache(): void {
    this.cache.clear();
    Array.from(this.nodes.values()).forEach((node) => {
      this.cache.set(this.resolvePath(node), node);
    });
  }

  /**
   * Recursively discovers and adds child nodes for the given parent node.
   * @param parent The parent node to discover children for.
   * @returns A promise that resolves when the discovery process is complete.
   */
  private async discover(parent: FileTreeNode): Promise<void> {
    // Skip if the parent node is a file, as files cannot have children
    if (parent.element instanceof FileSystemFileHandle) {
      return;
    }

    // Explicitly cast the parent element to a directory handle
    const element = parent.element as unknown as FileSystemDirectoryHandle;

    // Iterate over the entries of the directory handle
    for await (const [_, handle] of element.entries() ?? []) {
      if (this.has(handle)) {
        continue;
      }

      // Construct the new child node
      const child = {
        element: handle,
        parent: this.get(parent.element),
        children: [],
        depth: (parent.depth ?? -1) + 1,
      };

      // Register the node before recursing so descendants can resolve it as a parent
      parent.children.push(child);
      this.nodes.set(handle, child);

      // Discover children of this child node
      await this.discover(child);
    }
  }

  /**
   * Resolves the full path of the given node by traversing up to the root.
   * @param node The node to resolve the path for.
   * @returns The full path as a string.
   */
  private resolvePath(node: FileTreeNode): string {
    const components: string[] = [];
    let current: FileTreeNode | undefined = node;
    while (current?.parent) {
      components.unshift(current.element.name);
      current = current.parent;
    }
    // Descendants are relative to the root; the root itself uses its own name
    return current && components.length === 0
      ? current.element.name
      : components.join("/");
  }

  /**
   * Checks if a node with the given full path exists in the tree.
   * @param path The full path of the node to check.
   * @returns True if the node exists, otherwise false.
   */
  hasPath(path: string): boolean {
    return this.cache.has(path);
  }

  /**
   * Finds a node by its full path in the tree.
   * @param path The full path of the node to find.
   * @returns The node if found, otherwise undefined.
   */
  find(path: string): FileTreeNode | undefined {
    return this.cache.get(path);
  }

  findAs<T extends FileSystemHandle>(path: string): ITreeNode<T> | undefined {
    return this.cache.get(path) as ITreeNode<T> | undefined;
  }

  findFile(path: string): FileSystemFileHandle | undefined {
    const node = this.findAs<FileSystemFileHandle>(path);
    if (!node) {
      return undefined;
    }
    if (!(node.element instanceof FileSystemFileHandle)) {
      return undefined;
    }
    return node.element;
  }

  findDirectory(path: string): FileSystemDirectoryHandle | undefined {
    const node = this.findAs<FileSystemDirectoryHandle>(path);
    if (!node) {
      return undefined;
    }
    if (!(node.element instanceof FileSystemDirectoryHandle)) {
      return undefined;
    }
    return node.element;
  }
}
