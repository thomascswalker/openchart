import {
  ObjectTreeModel,
  type ObjectTreeModelOptions,
} from "../../models/tree/objectTree";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ITreeNode } from "./tree";
import {
  FileSystemDirectoryHandle,
  FileSystemFileHandle,
  FileSystemHandle,
} from "native-file-system-adapter";

export type FileTreeNode = ITreeNode<FileSystemHandle>;

/**
 * Represents a file tree model that manages a hierarchical structure of file
 * system handles.
 */
export class FileTreeModel extends ObjectTreeModel<FileSystemHandle> {
  private cache = new Map<string, FileTreeNode>();

  constructor(
    root: FileSystemHandle,
    options?: Omit<ObjectTreeModelOptions<FileSystemHandle>, "onRefresh">,
  ) {
    if (root.kind !== "directory") {
      throw new Error("Root must be a directory handle");
    }
    super(root, {
      ...options,
      onRefresh: async (): Promise<void> => {
        Object.assign(this._root, {
          collapsible: true,
          collapsed: false,
          selectable: true,
          selected: false,
        });
        await this.discover(this._root);
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
    Array.from(this._nodes.values()).forEach((node) => {
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
      const child: FileTreeNode = {
        element: handle,
        parent: this.get(parent.element),
        children: [],
        depth: (parent.depth ?? -1) + 1,
        collapsible: handle.kind === "directory",
        collapsed: false,
        selectable: true,
        selected: false,
        visible: true,
      };

      // Register the node before recursing so descendants can resolve it as a parent
      parent.children.push(child);
      this._nodes.set(handle, child);

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

type UseFileTreeModelResult = Pick<
  FileTreeModel,
  | "filter"
  | "find"
  | "findAs"
  | "findFile"
  | "findDirectory"
  | "refresh"
  | "toggleCollapse"
  | "collapse"
  | "expand"
  | "select"
  | "deselect"
  | "toggleSelect"
> & { nodes: FileTreeNode[]; visibleNodes: FileTreeNode[] };

export const useFileTreeModel = (
  rootHandle: FileSystemDirectoryHandle,
  options?: Omit<ObjectTreeModelOptions<FileSystemHandle>, "onRefresh">,
): UseFileTreeModelResult => {
  // Only recreate the tree if the root handle changes; callbacks are read
  // through a ref so inline handlers don't trigger a rebuild.
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const tree = useMemo(
    () =>
      new FileTreeModel(rootHandle, {
        onCollapsed: (n) => optionsRef.current?.onCollapsed?.(n),
        onExpanded: (n) => optionsRef.current?.onExpanded?.(n),
        onSelected: (n) => optionsRef.current?.onSelected?.(n),
        onDeselected: (n) => optionsRef.current?.onDeselected?.(n),
      }),
    [rootHandle],
  );
  const [, setVersion] = useState(0);

  // Discovery is async and mutates the model in place, so re-render on notify
  const refresh = useCallback(async () => {
    await tree.refresh();
    tree.notify();
  }, [tree]);

  useEffect(() => {
    const listener = () => setVersion((v) => v + 1);
    tree.subscribe(listener);
    void refresh();
    return () => tree.unsubscribe(listener);
  }, [tree, refresh]);

  const nodes = Array.from(tree.nodes.values());
  const visibleNodes = nodes.filter((node) => {
    // Always show the root node
    if (node.depth === 0) {
      return true;
    }

    // If the node is not visible, don't show it
    if (!node.visible) {
      return false;
    }

    // If any ancestor is collapsed, don't show the node
    let current: FileTreeNode | undefined = node.parent;
    while (current) {
      if (current.collapsed) {
        return false;
      }
      current = current.parent;
    }
    return true;
  });

  return {
    nodes,
    visibleNodes,
    filter: tree.filter.bind(tree),
    find: tree.find.bind(tree),
    findAs: tree.findAs.bind(tree),
    findFile: tree.findFile.bind(tree),
    findDirectory: tree.findDirectory.bind(tree),
    refresh,
    toggleCollapse: tree.toggleCollapse.bind(tree),
    collapse: tree.collapse.bind(tree),
    expand: tree.expand.bind(tree),
    select: tree.select.bind(tree),
    deselect: tree.deselect.bind(tree),
    toggleSelect: tree.toggleSelect.bind(tree),
  };
};
