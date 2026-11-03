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
  private loaded = new Set<FileTreeNode>();

  constructor(
    root: FileSystemDirectoryHandle,
    options?: Omit<ObjectTreeModelOptions<FileSystemHandle>, "onRefresh">,
  ) {
    if (root.kind !== "directory") {
      throw new Error("Root must be a directory handle");
    }
    super(root, {
      ...options,
      onRefresh: async (): Promise<void> => {
        this.loaded.clear();
        Object.assign(this._rootNode, {
          collapsible: true,
          collapsed: false,
          selectable: true,
          selected: false,
        });
        await this.discover(this._rootNode);
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

    const orderedNodes: FileTreeNode[] = [];
    const visit = (node: FileTreeNode): void => {
      orderedNodes.push(node);
      node.children.forEach(visit);
    };
    visit(this._rootNode);

    this._nodes.clear();
    orderedNodes.forEach((node) => {
      this._nodes.set(node.element, node);
      this.cache.set(this.resolvePath(node), node);
    });
  }

  /**
   * Discovers and adds the immediate children of the given directory node.
   * Subdirectories are added collapsed and are only read when expanded.
   * @param parent The parent node to discover children for.
   */
  private async discover(parent: FileTreeNode): Promise<void> {
    // `kind` is used because native picker handles aren't instances of the adapter classes
    if (parent.element.kind !== "directory" || this.loaded.has(parent)) {
      return;
    }
    this.loaded.add(parent);

    const element = parent.element as unknown as FileSystemDirectoryHandle;

    const entries: FileSystemHandle[] = [];
    try {
      for await (const handle of element.values()) {
        entries.push(handle);
      }
    } catch (error) {
      // Unreadable or vanished directories shouldn't break the tree
      console.warn(`Unable to read directory "${element.name}"`, error);
    }

    // A refresh may have replaced the tree while entries were being read
    if (this._nodes.get(parent.element) !== parent) {
      return;
    }

    for (const handle of entries) {
      if (this.has(handle)) {
        continue;
      }
      const isDirectory = handle.kind === "directory";
      const child: FileTreeNode = {
        element: handle,
        parent,
        children: [],
        depth: (parent.depth ?? -1) + 1,
        collapsible: isDirectory,
        collapsed: isDirectory,
        selectable: true,
        selected: false,
        visible: true,
      };
      parent.children.push(child);
      this._nodes.set(handle, child);
    }
    this.buildCache();
  }

  override expand(node: FileTreeNode): void {
    super.expand(node);
    if (node.collapsed || this.loaded.has(node)) {
      return;
    }
    void this.discover(node).then(() => this.notify());
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
    if (node.element.kind !== "file") {
      return undefined;
    }
    return node.element;
  }

  findDirectory(path: string): FileSystemDirectoryHandle | undefined {
    const node = this.findAs<FileSystemDirectoryHandle>(path);
    if (!node) {
      return undefined;
    }
    if (node.element.kind !== "directory") {
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
