"use client";

import { useMemo, useState } from "react";
import { ChevronRightIcon, FileIcon, FolderIcon, FolderOpenIcon } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { WorkspaceTreeEntry } from "@/lib/file-system-access";
import { cn } from "@/lib/utils";

type FileTreeNode = {
  entry: WorkspaceTreeEntry;
  children: FileTreeNode[];
};

function buildTree(entries: WorkspaceTreeEntry[]) {
  const roots: FileTreeNode[] = [];
  const parents: FileTreeNode[] = [];

  for (const entry of entries) {
    const node = { entry, children: [] } satisfies FileTreeNode;
    const parent = parents[entry.depth - 1];

    if (parent) parent.children.push(node);
    else roots.push(node);

    parents.length = entry.depth;
    if (entry.kind === "directory") parents.push(node);
  }

  return roots;
}

type TreeNodeProps = {
  node: FileTreeNode;
  selectedId?: string;
  onSelect: (entry: WorkspaceTreeEntry) => void;
};

function TreeNode({ node, selectedId, onSelect }: TreeNodeProps) {
  const { entry } = node;
  const [open, setOpen] = useState(true);
  const rowClassName = cn(
    "flex w-full items-center gap-2 rounded-lg py-2 pr-3 text-left text-sm transition-colors",
    selectedId === entry.id
      ? "bg-background text-foreground"
      : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
  );
  const rowStyle = { paddingLeft: `${12 + entry.depth * 16}px` };

  if (entry.kind === "file") {
    return (
      <button
        type="button"
        role="treeitem"
        aria-selected={selectedId === entry.id}
        className={rowClassName}
        style={rowStyle}
        onClick={() => onSelect(entry)}
      >
        <FileIcon className="size-4 shrink-0" aria-hidden="true" />
        <span className="truncate" title={entry.displayPath}>{entry.name}</span>
      </button>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        role="treeitem"
        aria-expanded={open}
        className={rowClassName}
        style={rowStyle}
      >
        <ChevronRightIcon
          className={cn("size-4 shrink-0 transition-transform", open && "rotate-90")}
          aria-hidden="true"
        />
        {open
          ? <FolderOpenIcon className="size-4 shrink-0" aria-hidden="true" />
          : <FolderIcon className="size-4 shrink-0" aria-hidden="true" />}
        <span className="truncate" title={entry.displayPath}>{entry.name}</span>
      </CollapsibleTrigger>
      <CollapsibleContent role="group">
        {node.children.map((child) => (
          <TreeNode
            key={child.entry.id}
            node={child}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

type FileTreeProps = {
  entries: WorkspaceTreeEntry[];
  selectedId?: string;
  onSelect: (entry: WorkspaceTreeEntry) => void;
};

export function FileTree({ entries, selectedId, onSelect }: FileTreeProps) {
  const nodes = useMemo(() => buildTree(entries), [entries]);

  return (
    <div role="tree" aria-label="工作区文件">
      {nodes.map((node) => (
        <TreeNode
          key={node.entry.id}
          node={node}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
