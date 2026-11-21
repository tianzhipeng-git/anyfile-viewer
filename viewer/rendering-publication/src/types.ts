export const CONTENT_CSP =
  "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src blob:; font-src blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
export interface SafeChapter {
  html: string;
  links: { path: string; fragment: string }[];
  missingResources: number;
  dispose(): void;
}
export interface TocTreeNode {
  readonly label: string;
  readonly path: string;
  readonly fragment: string;
  readonly children: readonly TocTreeNode[];
}
export interface PublicationSource {
  title: string;
  author: string;
  spine: { id: string; path: string }[];
  toc: { label: string; path: string; fragment: string }[];
  tocTree?: readonly TocTreeNode[];
  index?: readonly { label: string; path: string; fragment: string }[];
  loadSection(path: string, signal: AbortSignal): Promise<SafeChapter>;
}
