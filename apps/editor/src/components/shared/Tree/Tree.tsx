import {
  useFileTreeModel,
  type FileTreeNode,
} from "../../../models/tree/fileTree";
import { FileSystemDirectoryHandle } from "native-file-system-adapter";
import { Text } from "../Text";
import { DownIcon, PlaceIcon } from "../Icon";
import styles from "./Tree.module.css";
import type { CSSProperties } from "react";
import { Button } from "../Button";

const RowHeight = 20;
const HalfRowHeight = RowHeight / 2;

interface FileTreeItemProps {
  node: FileTreeNode;
}

const FileTreeItem = ({ node }: FileTreeItemProps) => {
  const name = node.element.name || "root";
  const isDirectory = node.element.kind === "directory";
  const icon = isDirectory ? (
    <DownIcon size={HalfRowHeight} />
  ) : (
    <PlaceIcon size={HalfRowHeight} />
  );
  return (
    <div
      className={styles["tree-item"]}
      key={node.element.name}
      style={
        {
          "--item-height": `${RowHeight}px`,
          "--item-depth": node.depth,
        } as CSSProperties
      }
    >
      {icon}
      <Text>{name}</Text>
    </div>
  );
};

interface FileTreeViewProps {
  rootHandle: FileSystemDirectoryHandle;
}

const FileTreeView = ({ rootHandle }: FileTreeViewProps) => {
  const { nodes, refresh } = useFileTreeModel(rootHandle);

  const makeKey = (node: FileTreeNode): string => {
    const parts: string[] = [];

    let n: FileTreeNode | undefined = node;
    while (n) {
      parts.unshift(n.element.name);
      n = n.parent;
    }

    return parts.join("/");
  };

  return (
    <div style={{ padding: 8 }}>
      <Button onClick={refresh}>Refresh</Button>
      {nodes.map((node) => (
        <FileTreeItem key={makeKey(node)} node={node} />
      ))}
    </div>
  );
};

export { FileTreeView };
