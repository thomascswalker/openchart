import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ObjectTreeModel, type ObjectTreeModelOptions } from './objectTree.js';
import type { ITreeNode } from './tree.js';

export type FileTreeNode = ITreeNode<FileSystemHandle>;

export class FileTreeModel extends ObjectTreeModel<FileSystemHandle> {
  private cache = new Map<string, FileTreeNode>();
  private loaded = new Set<FileTreeNode>();

  constructor(
    root: FileSystemDirectoryHandle,
    options?: Omit<ObjectTreeModelOptions<FileSystemHandle>, 'onRefresh'>,
  ) {
    if (root.kind !== 'directory') {
      throw new Error('Root must be a directory handle');
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

  private async discover(parent: FileTreeNode): Promise<void> {
    if (parent.element.kind !== 'directory' || this.loaded.has(parent)) {
      return;
    }
    this.loaded.add(parent);

    const element = parent.element as unknown as FileSystemDirectoryHandle;
    const entries: FileSystemHandle[] = [];
    try {
      for await (const handle of element.values()) {
        entries.push(handle as FileSystemHandle);
      }
    } catch (error) {
      console.warn(`Unable to read directory "${element.name}"`, error);
    }

    if (this._nodes.get(parent.element) !== parent) {
      return;
    }

    for (const handle of entries) {
      if (this.has(handle)) {
        continue;
      }
      const isDirectory = handle.kind === 'directory';
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

  private resolvePath(node: FileTreeNode): string {
    const components: string[] = [];
    let current: FileTreeNode | undefined = node;
    while (current?.parent) {
      components.unshift(current.element.name);
      current = current.parent;
    }
    return current && components.length === 0
      ? current.element.name
      : components.join('/');
  }

  hasPath(path: string): boolean {
    return this.cache.has(path);
  }

  find(path: string): FileTreeNode | undefined {
    return this.cache.get(path);
  }

  findAs<THandle extends FileSystemHandle>(
    path: string,
  ): ITreeNode<THandle> | undefined {
    return this.cache.get(path) as ITreeNode<THandle> | undefined;
  }

  findFile(path: string): FileSystemFileHandle | undefined {
    const node = this.findAs<FileSystemFileHandle>(path);
    if (!node || node.element.kind !== 'file') {
      return undefined;
    }
    return node.element;
  }

  findDirectory(path: string): FileSystemDirectoryHandle | undefined {
    const node = this.findAs<FileSystemDirectoryHandle>(path);
    if (!node || node.element.kind !== 'directory') {
      return undefined;
    }
    return node.element;
  }
}

export type UseFileTreeModelResult = Pick<
  FileTreeModel,
  | 'filter'
  | 'find'
  | 'findAs'
  | 'findFile'
  | 'findDirectory'
  | 'refresh'
  | 'toggleCollapse'
  | 'collapse'
  | 'expand'
  | 'select'
  | 'deselect'
  | 'toggleSelect'
> & { nodes: FileTreeNode[]; visibleNodes: FileTreeNode[] };

export const useFileTreeModel = (
  rootHandle: FileSystemDirectoryHandle,
  options?: Omit<ObjectTreeModelOptions<FileSystemHandle>, 'onRefresh'>,
): UseFileTreeModelResult => {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const tree = useMemo(
    () =>
      new FileTreeModel(rootHandle, {
        onCollapsed: (node) => optionsRef.current?.onCollapsed?.(node),
        onExpanded: (node) => optionsRef.current?.onExpanded?.(node),
        onSelected: (node) => optionsRef.current?.onSelected?.(node),
        onDeselected: (node) => optionsRef.current?.onDeselected?.(node),
      }),
    [rootHandle],
  );
  const [, setVersion] = useState(0);

  const refresh = useCallback(async () => {
    await tree.refresh();
    tree.notify();
  }, [tree]);

  useEffect(() => {
    const listener = () => setVersion((version) => version + 1);
    tree.subscribe(listener);
    void refresh();
    return () => tree.unsubscribe(listener);
  }, [tree, refresh]);

  const nodes = Array.from(tree.nodes.values());
  const visibleNodes = nodes.filter((node) => {
    if (node.depth === 0 || !node.visible) {
      return node.depth === 0;
    }

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
