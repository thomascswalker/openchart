export interface ITreeNode<T> {
  readonly element: T;
  readonly parent?: ITreeNode<T>;
  readonly children: ITreeNode<T>[];
  readonly depth: number;
  visible?: boolean;
  collapsed?: boolean;
  collapsible?: boolean;
  selected?: boolean;
  selectable?: boolean;
}

export interface ITreeModel<T, TRef> {
  readonly rootRef: TRef;

  has(ref: TRef): boolean;
  get(ref: TRef): ITreeNode<T> | undefined;
  filter(predicate: (node: ITreeNode<T>) => boolean): ITreeNode<T>[];
}
