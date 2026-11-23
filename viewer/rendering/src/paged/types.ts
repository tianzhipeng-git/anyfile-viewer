import type { Locale } from "@anyfile/viewer-protocol";

export interface PageSize {
  readonly width: number;
  readonly height: number;
}

export interface PagedOutlineItem {
  readonly title: string;
  readonly page: number;
  readonly children: readonly PagedOutlineItem[];
}

export interface PagedTextWord {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly text: string;
}

export interface PagedTextLayer {
  readonly scale: number;
  readonly words: readonly PagedTextWord[];
}

export interface PageRenderRequest {
  readonly displayWidth: number;
  readonly displayHeight: number;
  readonly scale: number;
  readonly pixelRatio: number;
  readonly maxPixels: number;
  readonly signal: AbortSignal;
}

export interface PagedDocumentSource {
  readonly pageCount: number;
  /** Known CSS reference sizes (at 100% scale). Optional when pages are sized lazily. */
  readonly pages?: readonly PageSize[];
  /** Fallback CSS reference size before a page's exact dimensions are discovered. */
  readonly defaultPageSize?: PageSize;
  /** Optional hierarchical table of contents / bookmarks. */
  readonly outline?: readonly PagedOutlineItem[];
  /** Render a page onto `canvas`. May return an updated CSS reference size if discovered lazily. */
  renderPage(
    pageIndex: number,
    canvas: HTMLCanvasElement,
    request: PageRenderRequest,
  ): Promise<PageSize | void>;
  /** Optional lazy thumbnail renderer for the sidebar. */
  renderThumbnail?(
    pageIndex: number,
    canvas: HTMLCanvasElement,
    width: number,
    height: number,
    signal: AbortSignal,
  ): Promise<void>;
  /** Optional selectable hidden text layer per page. */
  getPageText?(pageIndex: number, signal: AbortSignal): Promise<PagedTextLayer | null>;
  /** Invoked when an offscreen page canvas is evicted to release format-specific page state. */
  onEvictPage?(pageIndex: number): void;
  /** Invoked when the source is replaced or the viewport is disposed. */
  dispose?(): void;
}

export type PagedFitMode = "width" | "page" | "custom";

export interface PagedFooterLink {
  readonly href: string;
  readonly label: string;
}

export interface PagedViewportCopy {
  readonly page: string;
  readonly previousPage: string;
  readonly nextPage: string;
  readonly zoomOut: string;
  readonly zoomIn: string;
  readonly fitWidth: string;
  readonly fitPage: string;
  readonly sidebar: string;
  readonly outline: string;
  readonly thumbnails: string;
  readonly noOutline: string;
  readonly textLayerOn: string;
  readonly renderFailed: string;
  readonly pageCountSuffix: (count: number) => string;
}

export interface PagedDocumentViewportOptions {
  readonly fileName: string;
  readonly locale: Locale;
  /** Optional plugin-specific root class appended alongside `anyfile-paged-viewer`. */
  readonly className?: string;
  readonly source?: PagedDocumentSource;
  readonly initialStatus?: string;
  readonly minScale?: number;
  readonly maxScale?: number;
  readonly scaleStep?: number;
  readonly initialScale?: number;
  readonly initialFitMode?: PagedFitMode;
  readonly maxRenderPixels?: number;
  readonly maxActiveCanvasPages?: number;
  readonly maxActiveThumbnails?: number;
  readonly copy?: Partial<PagedViewportCopy>;
  readonly footerLink?: PagedFooterLink;
}

export interface PagedDocumentViewport {
  readonly root: HTMLElement;
  readonly viewport: HTMLElement;
  setSource(source: PagedDocumentSource): void;
  setOutline(outline: readonly PagedOutlineItem[]): void;
  showStatus(message: string, options?: { readonly isError?: boolean }): void;
  jumpToPage(pageIndex: number): void;
  dispose(): void;
}
