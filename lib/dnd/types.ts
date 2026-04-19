/**
 * Typed data payloads for @dnd-kit draggable sources and droppable targets.
 * Used across the feed, bars, and top bar trash zone.
 */

export type DragSource =
  | { kind: "node"; nodeId: string }
  | { kind: "tag"; tagId: string; nodeId: string } // tag chip on a node (drag-off = remove)
  | { kind: "friend"; friendUserId: string }
  | { kind: "folder"; folderId: string };

export type DropTarget =
  | { kind: "friend"; friendUserId: string }
  | { kind: "group"; groupId: string }
  | { kind: "folder"; folderId: string }
  | { kind: "tag"; tagId: string }
  | { kind: "node"; nodeId: string } // card→card auto-create folder
  | { kind: "trash" };

export const DND_SOURCE_PREFIX = {
  node: "node:",
  tag: "tag:",
} as const;

export const DND_TARGET_PREFIX = {
  friend: "friend:",
  group: "group:",
  folder: "folder:",
  tag: "tag:",
  trash: "trash",
} as const;

/** Build a stable DndKit id from a typed source. */
export function sourceId(s: DragSource): string {
  switch (s.kind) {
    case "node":
      return `src-node:${s.nodeId}`;
    case "tag":
      return `src-tag:${s.nodeId}:${s.tagId}`;
    case "friend":
      return `src-friend:${s.friendUserId}`;
    case "folder":
      return `src-folder:${s.folderId}`;
  }
}

/** Build a stable DndKit id from a typed target. */
export function targetId(t: DropTarget): string {
  switch (t.kind) {
    case "friend":
      return `tgt-friend:${t.friendUserId}`;
    case "group":
      return `tgt-group:${t.groupId}`;
    case "folder":
      return `tgt-folder:${t.folderId}`;
    case "tag":
      return `tgt-tag:${t.tagId}`;
    case "node":
      return `tgt-node:${t.nodeId}`;
    case "trash":
      return "tgt-trash";
  }
}
