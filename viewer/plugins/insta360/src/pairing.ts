import type { WorkspaceReader } from "@anyfile/viewer-protocol";

import type { Insta360VideoInspection } from "./video-inspection";

export type InsvRole = "00" | "10";

export interface InsvName {
  readonly role: InsvRole;
  readonly group: string;
}

const INSV_NAME = /^VID_(\d{8})_(\d{6})_(00|10)_(\d+)\.insv$/i;

export function parseInsvName(name: string): InsvName | undefined {
  const match = INSV_NAME.exec(name);
  if (!match) return undefined;
  return {
    role: match[3] as InsvRole,
    group: `${match[1]}_${match[2]}_${match[4]}`,
  };
}

export interface InsvPair {
  readonly front: File;
  readonly back: File;
  readonly frontInspection: Insta360VideoInspection;
  readonly backInspection: Insta360VideoInspection;
}

export async function findInsvPair(
  currentFile: File,
  currentInspection: Insta360VideoInspection,
  workspace: WorkspaceReader | undefined,
  signal: AbortSignal,
  inspect: (file: File, signal: AbortSignal) => Promise<Insta360VideoInspection | undefined>,
): Promise<InsvPair | undefined> {
  const currentName = parseInsvName(currentFile.name);
  if (!workspace || !currentName || currentInspection.layout !== "single" || currentInspection.role !== currentName.role) {
    return undefined;
  }

  const counterpartRole: InsvRole = currentName.role === "00" ? "10" : "00";
  const candidates: string[] = [];
  for await (const entry of workspace.list("", { signal })) {
    if (entry.kind !== "file") continue;
    const parsed = parseInsvName(entry.name);
    if (parsed?.group === currentName.group && parsed.role === counterpartRole) {
      candidates.push(entry.relativePath);
    }
  }
  if (candidates.length !== 1) return undefined;

  const counterpart = await workspace.open(candidates[0], { signal });
  if (!counterpart) return undefined;
  const counterpartInspection = await inspect(counterpart, signal);
  const counterpartName = parseInsvName(counterpart.name);
  if (
    !counterpartInspection
    || counterpartInspection.layout !== "single"
    || counterpartInspection.role !== counterpartRole
    || counterpartName?.group !== currentName.group
  ) return undefined;

  return currentName.role === "00"
    ? { front: currentFile, back: counterpart, frontInspection: currentInspection, backInspection: counterpartInspection }
    : { front: counterpart, back: currentFile, frontInspection: counterpartInspection, backInspection: currentInspection };
}
