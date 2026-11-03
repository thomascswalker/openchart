import { Subscriber } from "../../util/subscriber";
import type { ITreeModel, ITreeNode } from "./tree";

interface ObjectTreeModelOptions {
  onRefresh?: () => void | Promise<void>;
}

export class ObjectTreeModel<T> extends Subscriber implements ITreeModel<T, T> {
  readonly rootRef: T;
  protected root: ITreeNode<T>;
  protected nodes = new Map<T | undefined, ITreeNode<T>>();

  protected onRefresh?: () => void | Promise<void>;

  constructor(root: T, options?: ObjectTreeModelOptions) {
    super();
    this.rootRef = root;
    this.root = { element: root, parent: undefined, children: [], depth: 0 };
    this.nodes.set(root, this.root);
    this.onRefresh = options?.onRefresh;
  }

  async refresh(): Promise<void> {
    this.root = {
      element: this.rootRef,
      parent: undefined,
      children: [],
      depth: 0,
    };
    this.nodes.clear();
    this.nodes.set(this.rootRef, this.root);
    await this.onRefresh?.();
  }

  has(element: T): boolean {
    return this.nodes.has(element);
  }

  get(element?: T): ITreeNode<T> | undefined {
    if (!element) {
      return this.root;
    }

    return this.nodes.get(element);
  }

  filter(predicate: (node: ITreeNode<T>) => boolean): ITreeNode<T>[] {
    const result: ITreeNode<T>[] = [];
    for (const node of this.nodes.values()) {
      if (predicate(node)) {
        result.push(node);
      }
    }
    return result;
  }
}
