import { Subscriber } from "../../util/subscriber";
import type { ITreeModel, ITreeNode } from "./tree";

export interface ObjectTreeModelOptions<T> {
  onRefresh?: () => void | Promise<void>;
  onCollapsed?: (node: ITreeNode<T>) => void;
  onExpanded?: (node: ITreeNode<T>) => void;
  onSelected?: (node: ITreeNode<T>) => void;
  onDeselected?: (node: ITreeNode<T>) => void;
}

export class ObjectTreeModel<T> extends Subscriber implements ITreeModel<T, T> {
  readonly rootRef: T;
  protected _root: ITreeNode<T>;
  protected _nodes = new Map<T | undefined, ITreeNode<T>>();

  protected _onRefresh?: () => void | Promise<void>;

  protected _onCollapsed?: (node: ITreeNode<T>) => void;
  protected _onExpanded?: (node: ITreeNode<T>) => void;
  protected _onSelected?: (node: ITreeNode<T>) => void;
  protected _onDeselected?: (node: ITreeNode<T>) => void;

  constructor(root: T, options?: ObjectTreeModelOptions<T>) {
    super();
    this.rootRef = root;
    this._root = { element: root, parent: undefined, children: [], depth: 0 };
    this._nodes.set(root, this._root);
    this._onRefresh = options?.onRefresh;
    this._onCollapsed = options?.onCollapsed;
    this._onExpanded = options?.onExpanded;
    this._onSelected = options?.onSelected;
    this._onDeselected = options?.onDeselected;
  }

  public get nodes(): Map<T | undefined, ITreeNode<T>> {
    return this._nodes;
  }

  async refresh(): Promise<void> {
    this._root = {
      element: this.rootRef,
      parent: undefined,
      children: [],
      depth: 0,
    };
    this._nodes.clear();
    this._nodes.set(this.rootRef, this._root);
    await this._onRefresh?.();
  }

  has(element: T): boolean {
    return this._nodes.has(element);
  }

  get(element?: T): ITreeNode<T> | undefined {
    if (!element) {
      return this._root;
    }

    return this._nodes.get(element);
  }

  filter(predicate: (node: ITreeNode<T>) => boolean): ITreeNode<T>[] {
    const result: ITreeNode<T>[] = [];
    for (const node of this._nodes.values()) {
      if (predicate(node)) {
        result.push(node);
      }
    }
    return result;
  }

  collapse(node: ITreeNode<T>): void {
    if (!node.collapsible || node.collapsed) return;
    node.collapsed = true;
    this._onCollapsed?.(node);
    this.notify();
  }

  expand(node: ITreeNode<T>): void {
    if (!node.collapsible || !node.collapsed) return;
    node.collapsed = false;
    this._onExpanded?.(node);
    this.notify();
  }

  toggleCollapse(node: ITreeNode<T>): void {
    if (node.collapsed) {
      this.expand(node);
    } else {
      this.collapse(node);
    }
  }

  select(node: ITreeNode<T>): void {
    if (!node.selectable || node.selected) return;
    node.selected = true;
    this._onSelected?.(node);
    this.notify();
  }

  deselect(node: ITreeNode<T>): void {
    if (!node.selected) return;
    node.selected = false;
    this._onDeselected?.(node);
    this.notify();
  }

  toggleSelect(node: ITreeNode<T>): void {
    if (node.selected) {
      this.deselect(node);
    } else {
      this.select(node);
    }
  }
}
