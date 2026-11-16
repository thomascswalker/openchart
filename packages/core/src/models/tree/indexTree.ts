import { Subscriber } from '../../util/subscriber.js';
import type { ITreeModel, ITreeNode } from './tree.js';

export class IndexTreeModel<T>
  extends Subscriber
  implements ITreeModel<T, number[]>
{
  readonly rootRef: number[] = [];
  private readonly root: ITreeNode<T>;

  constructor(root: T) {
    super();
    this.root = { element: root, parent: undefined, children: [], depth: 0 };
  }

  private getNode(
    location: number[],
    node: ITreeNode<T> = this.root,
  ): ITreeNode<T> | undefined {
    if (!location || location.length === 0) {
      return node;
    }

    const [index, ...rest] = location;
    if (index < 0 || index >= node.children.length) {
      throw new Error(`Invalid tree location: ${location}`);
    }

    return this.getNode(rest, node.children[index]);
  }

  has(ref: number[]): boolean {
    return this.getNode(ref) !== undefined;
  }

  get(ref: number[]): ITreeNode<T> | undefined {
    return this.getNode(ref);
  }

  filter(predicate: (node: ITreeNode<T>) => boolean): ITreeNode<T>[] {
    const result: ITreeNode<T>[] = [];
    const traverse = (node: ITreeNode<T>) => {
      if (predicate(node)) {
        result.push(node);
      }
      for (const child of node.children) {
        traverse(child);
      }
    };
    traverse(this.root);
    return result;
  }
}
