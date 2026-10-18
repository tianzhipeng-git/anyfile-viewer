export type TopicKind = "attached" | "detached" | "summary" | "callout";
export interface TopicStyle {
  color?: string; fill?: string; stroke?: string; fontSize?: number;
  bold?: boolean; italic?: boolean; shape?: string;
}
export interface Relationship { from: string; to: string; title: string }
export interface Boundary { start: number; end: number; title: string; summaryId?: string }
export interface Topic {
  id: string; title: string; notes: string; link: string; children: Topic[];
  kind: TopicKind; style: TopicStyle; direction?: "left" | "right" | "down" | "up";
  structure: string; position?: { x: number; y: number }; folded: boolean;
  attachments: { name: string; path: string }[];
  image?: string; imageWidth?: number; imageHeight?: number;
  markers: string[]; labels: string[]; metadata: Record<string, string>;
  boundaries: Boundary[]; relationships: Relationship[];
}
export interface Sheet {
  title: string; root: Topic; relationships?: Relationship[];
  assets?: Map<string, Blob>; attachmentText?: Map<string, string>;
}
export const finite = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) && Math.abs(n) <= 1_000_000 ? n : undefined;
};
// Colors are values, never arbitrary CSS or paint-server URLs from the document.
export function color(value: unknown): string | undefined {
  return typeof value === "string" && /^#[\da-f]{3,8}$/i.test(value) ? value : undefined;
}
