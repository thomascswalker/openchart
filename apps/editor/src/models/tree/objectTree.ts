import { Subscriber } from "../../util/subscriber";
import type { ITreeModel, ITreeNode } from "./tree";

interface ObjectTreeModelOptions {
  onRefresh?: () => void | Promise<void>;
}

export class ObjectTreeModel<T> extends Subscriber implements ITreeModel<T, T> {
  readonly rootRef: T;
  protected _root: ITreeNode<T>;
  protected _nodes = new Map<T | undefined, ITreeNode<T>>();

  protected _onRefresh?: () => void | Promise<void>;

  constructor(root: T, options?: ObjectTreeModelOptions) {
    super();
    this.rootRef = root;
    this._root = { element: root, parent: undefined, children: [], depth: 0 };
    this._nodes.set(root, this._root);
    this._onRefresh = options?.onRefresh;
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
}
