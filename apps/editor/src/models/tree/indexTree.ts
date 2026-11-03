import { Subscriber } from "../../util/subscriber";
import type { ITreeModel, ITreeNode } from "./tree";

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

  /**
   * Retrieves the node at the specified location within the tree.
   * @param location The location of the node as an array of indices.
   * @param node The current node to start the search from (default is the root).
   * @returns The node if found, otherwise undefined.
   */
  private getNode(
    location: number[],
    node: ITreeNode<T> = this.root,
  ): ITreeNode<T> | undefined {
    if (!location || location.length === 0) {
      return node;
    }
    // Extract the first index from the location array and the rest of the
    // indices for recursive traversal.
    const [index, ...rest] = location;

    // Check if the index is within the valid range of the current node's
    // children.
    if (index < 0 || index >= node.children.length) {
      throw new Error(`Invalid tree location: ${location}`);
    }

    // Recursively call `getNode` with the remaining indices and the child node
    // at the current index.
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
