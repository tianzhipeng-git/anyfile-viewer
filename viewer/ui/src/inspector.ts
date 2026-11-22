import { createBadge, type InspectorBadge } from "./controls";
import { el } from "./dom";
import { inspectorStyles } from "./inspector-styles";

export type InspectorShellOptions = {
  readonly className: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly stats?: readonly string[];
  readonly badges?: readonly InspectorBadge[];
  readonly layout?: "scroll" | "split";
  readonly viewportClassName?: string;
  readonly sidebarClassName?: string;
  readonly extraStyles?: string;
};

export type InspectorShell = {
  readonly root: HTMLDivElement;
  readonly header: HTMLElement;
  readonly toolbar: HTMLDivElement;
  readonly body: HTMLDivElement;
  readonly viewport: HTMLDivElement;
  readonly sidebar?: HTMLElement;
  setTitle(title: string, subtitle?: string): void;
  setStats(stats: readonly string[]): void;
  setBadges(badges: readonly InspectorBadge[]): void;
  onDispose(cleanup: () => void): void;
  dispose(): void;
};

export function createInspectorShell(options: InspectorShellOptions): InspectorShell {
  const root = el("div", ["anyfile-inspector", options.className].filter(Boolean).join(" "));
  const style = el("style");
  style.textContent = options.extraStyles ? `${inspectorStyles}\n${options.extraStyles}` : inspectorStyles;

  const titleElement = el("strong", { className: "anyfile-inspector__title", title: options.title }, options.title);
  const subtitleElement = el("span", { className: "anyfile-inspector__subtitle", hidden: !options.subtitle }, options.subtitle ?? "");
  const identity = el("div", "anyfile-inspector__identity", titleElement, subtitleElement);
  const statsContainer = el("div", "anyfile-inspector__stats");
  const badgesContainer = el("div", "anyfile-inspector__badges");

  const setStats = (stats: readonly string[]) => {
    statsContainer.replaceChildren(...stats.map((text) => el("span", "anyfile-inspector__stat", text)));
  };
  const setBadges = (badges: readonly InspectorBadge[]) => {
    badgesContainer.replaceChildren(...badges.map((badge) => createBadge(badge.text, badge.tone)));
  };
  if (options.stats?.length) setStats(options.stats);
  if (options.badges?.length) setBadges(options.badges);

  const header = el("header", "anyfile-inspector__header", identity, badgesContainer, statsContainer);
  const toolbar = el("div", "anyfile-inspector__toolbar");

  const isSplit = options.layout === "split";
  const body = el("div", isSplit ? "anyfile-inspector__body anyfile-inspector__body--split" : "anyfile-inspector__body");
  const sidebar = isSplit
    ? el("aside", ["anyfile-inspector__sidebar", options.sidebarClassName].filter(Boolean).join(" "))
    : undefined;
  const viewport = el("div", ["anyfile-inspector__viewport", options.viewportClassName].filter(Boolean).join(" "));

  if (sidebar) body.append(sidebar);
  body.append(viewport);
  root.append(style, header, toolbar, body);

  const cleanups: Array<() => void> = [];
  let disposed = false;

  return {
    root,
    header,
    toolbar,
    body,
    viewport,
    sidebar,
    setTitle(title: string, subtitle?: string) {
      titleElement.textContent = title;
      titleElement.title = title;
      if (subtitle !== undefined) {
        subtitleElement.textContent = subtitle;
        subtitleElement.hidden = !subtitle;
      }
    },
    setStats,
    setBadges,
    onDispose(cleanup: () => void) {
      if (disposed) {
        cleanup();
        return;
      }
      cleanups.push(cleanup);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const cleanup of cleanups.splice(0).reverse()) cleanup();
      root.remove();
    },
  };
}

export type KeyValueItem = {
  readonly label: string;
  readonly value: string | Node;
  readonly mono?: boolean;
  readonly hidden?: boolean;
};

export type KeyValueListOptions = {
  readonly variant?: "list" | "cards";
  readonly className?: string;
};

export function createKeyValueList(
  items: readonly KeyValueItem[],
  options?: KeyValueListOptions,
): HTMLDListElement {
  const variant = options?.variant ?? "list";
  const dl = el("dl", ["anyfile-inspector__kv", `anyfile-inspector__kv--${variant}`, options?.className].filter(Boolean).join(" "));
  for (const item of items) {
    if (item.hidden) continue;
    const dt = el("dt", undefined, item.label);
    const dd = el("dd", item.mono ? "anyfile-inspector__mono" : undefined, item.value);
    if (variant === "cards") {
      dl.append(el("div", "anyfile-inspector__kv-item", dt, dd));
    } else {
      dl.append(dt, dd);
    }
  }
  return dl;
}
