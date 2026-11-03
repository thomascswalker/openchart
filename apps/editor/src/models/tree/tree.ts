import type { Subscriber } from "../../util/subscriber";

export interface ITreeNode<T> {
  readonly element: T;
  readonly parent?: ITreeNode<T>;
  readonly children: ITreeNode<T>[];
  readonly depth: number;
}

export interface ITreeModel<T, TRef> extends Subscriber {
  readonly rootRef: TRef;

  has(ref: TRef): boolean;
  get(ref: TRef): ITreeNode<T> | undefined;
  filter(predicate: (node: ITreeNode<T>) => boolean): ITreeNode<T>[];
}
