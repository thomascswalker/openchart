import {
  useFileTreeModel,
  type FileTreeNode,
} from "../../../models/tree/fileTree";
import { FileSystemDirectoryHandle } from "native-file-system-adapter";
import { Text } from "../Text";
import { DownIcon, FileIcon, ResetIcon } from "../Icon";
import styles from "./Tree.module.css";
import { useMemo, useState, type CSSProperties } from "react";
import { Button } from "../Button";
import { Section } from "../Section";
import { Input } from "../Input";

const DefaultRowHeight = 20;

interface FileTreeItemProps {
  node: FileTreeNode;
  rowHeight: number;
  onClick?: (node: FileTreeNode) => void;
}

const FileTreeItem = ({ node, rowHeight, onClick }: FileTreeItemProps) => {
  const name = node.element.name || "root";
  const isDirectory = node.element.kind === "directory";
  const iconSize = (rowHeight * 3) / 4;

  const arrowStyle = {
    transform: node.collapsed ? "rotate(-90deg)" : "rotate(0deg)",
    transition: "transform 0.1s ease",
  };
  const icon = isDirectory ? (
    <DownIcon size={iconSize} style={arrowStyle} />
  ) : (
    <FileIcon size={iconSize} style={{ marginLeft: `${iconSize / 4}px` }} />
  );
  return (
    <div
      className={`${styles["tree-item"]} ${node.selected ? styles["selected"] : ""}`}
      key={node.element.name}
      style={
        {
          "--item-height": `${rowHeight}px`,
          "--item-depth": node.depth,
          "--icon-size": `${iconSize}px`,
        } as CSSProperties
      }
      onClick={() => onClick?.(node)}
    >
      {icon}
      <Text>{name}</Text>
    </div>
  );
};

interface FileTreeViewProps {
  rootHandle: FileSystemDirectoryHandle;
  rowHeight?: number;
}

const FileTreeView = ({
  rootHandle,
  rowHeight = DefaultRowHeight,
}: FileTreeViewProps) => {
  const { nodes, visibleNodes, refresh, toggleCollapse, select, deselect } =
    useFileTreeModel(rootHandle);
  const [query, setQuery] = useState("");

  const makeKey = (node: FileTreeNode): string => {
    const parts: string[] = [];

    let n: FileTreeNode | undefined = node;
    while (n) {
      parts.unshift(n.element.name);
      n = n.parent;
    }

    return parts.join("/");
  };

  // While searching, show matching nodes plus their ancestors, ignoring
  // collapsed state so matches inside collapsed folders are reachable.
  const displayedNodes = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return visibleNodes;
    }
    const shown = new Set<FileTreeNode>();
    for (const node of nodes) {
      if (!node.element.name.toLowerCase().includes(needle)) {
        continue;
      }
      let current: FileTreeNode | undefined = node;
      while (current && !shown.has(current)) {
        shown.add(current);
        current = current.parent;
      }
    }
    return nodes.filter((node) => shown.has(node));
  }, [query, nodes, visibleNodes]);

  const handleClick = (node: FileTreeNode) => {
    nodes.filter((n) => n.selected && n !== node).forEach(deselect);
    select(node);
    toggleCollapse(node);
  };

  return (
    <div style={{ padding: 8 }}>
      <Section flexDirection="row">
        <Input
          placeholder="Search..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Button
          onClick={refresh}
          icon={<ResetIcon size={12} />}
          minHeight={0}
          padding={0}
          maxWidth={16}
        />
      </Section>

      {displayedNodes.map((node) => (
        <FileTreeItem
          key={makeKey(node)}
          node={node}
          rowHeight={rowHeight}
          onClick={handleClick}
        />
      ))}
    </div>
  );
};

export { FileTreeView };
