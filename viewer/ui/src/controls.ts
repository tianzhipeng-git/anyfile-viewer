import { el, type ElChild } from "./dom";

export type InspectorTone = "neutral" | "accent" | "info" | "success" | "warning" | "danger";

export type InspectorBadge = {
  readonly text: string;
  readonly tone?: Exclude<InspectorTone, "info">;
};

export type FilterInputOptions = {
  readonly placeholder: string;
  readonly ariaLabel?: string;
  readonly className?: string;
  readonly dataset?: Readonly<Record<string, string | undefined>>;
  readonly onInput: (query: string) => void;
};

export type FilterInput = {
  readonly input: HTMLInputElement;
  readonly value: string;
  setValue(value: string): void;
  dispose(): void;
};

export function createFilterInput(options: FilterInputOptions): FilterInput {
  const input = el("input", {
    className: ["anyfile-inspector__filter", options.className].filter(Boolean).join(" "),
    dataset: options.dataset,
    attrs: {
      type: "search",
      placeholder: options.placeholder,
      "aria-label": options.ariaLabel ?? options.placeholder,
    },
  });
  const handleInput = () => options.onInput(input.value.trim().toLowerCase());
  input.addEventListener("input", handleInput);
  return {
    input,
    get value() {
      return input.value;
    },
    setValue(value: string) {
      input.value = value;
    },
    dispose() {
      input.removeEventListener("input", handleInput);
    },
  };
}

export function createSection(
  title: string,
  content?: ElChild | readonly ElChild[],
  options?: { readonly headingLevel?: 2 | 3; readonly className?: string },
): HTMLElement {
  const headingTag = options?.headingLevel === 3 ? "h3" : "h2";
  const children = content === undefined ? [] : Array.isArray(content) ? content : [content];
  return el(
    "section",
    ["anyfile-inspector__section", options?.className].filter(Boolean).join(" "),
    el(headingTag, "anyfile-inspector__heading", title),
    ...children,
  );
}

export function createNotice(
  text: string,
  tone: "info" | "warning" | "danger" | "success" = "info",
): HTMLParagraphElement {
  const modifier = tone === "info" ? "" : ` anyfile-inspector__notice--${tone}`;
  return el("p", `anyfile-inspector__notice${modifier}`, text);
}

export function createBadge(
  text: string,
  tone: Exclude<InspectorTone, "info"> = "neutral",
): HTMLSpanElement {
  const modifier = tone === "neutral" ? "" : ` anyfile-inspector__badge--${tone}`;
  return el("span", `anyfile-inspector__badge${modifier}`, text);
}

export type TabItem<T extends string = string> = {
  readonly id: T;
  readonly label: string;
};

export type TabBarOptions<T extends string = string> = {
  readonly items: readonly TabItem<T>[];
  readonly activeId?: T;
  readonly className?: string;
  readonly buttonClassName?: string;
  readonly onChange: (id: T) => void;
};

export type TabBar<T extends string = string> = {
  readonly element: HTMLDivElement;
  readonly buttons: ReadonlyMap<T, HTMLButtonElement>;
  getActive(): T | undefined;
  setActive(id: T): void;
  dispose(): void;
};

export function createTabBar<T extends string = string>(options: TabBarOptions<T>): TabBar<T> {
  const element = el("div", ["anyfile-inspector__tabs", options.className].filter(Boolean).join(" "));
  const buttons = new Map<T, HTMLButtonElement>();
  const cleanups: Array<() => void> = [];
  let active: T | undefined = options.activeId ?? options.items[0]?.id;

  const sync = () => {
    for (const [id, button] of buttons) {
      button.setAttribute("aria-pressed", id === active ? "true" : "false");
    }
  };

  for (const item of options.items) {
    const button = el("button", {
      className: ["anyfile-inspector__tab", options.buttonClassName].filter(Boolean).join(" "),
      attrs: { type: "button", "aria-pressed": item.id === active ? "true" : "false" },
      title: item.label,
    }, item.label);
    const onClick = () => {
      if (active === item.id) return;
      active = item.id;
      sync();
      options.onChange(item.id);
    };
    button.addEventListener("click", onClick);
    cleanups.push(() => button.removeEventListener("click", onClick));
    buttons.set(item.id, button);
    element.append(button);
  }

  return {
    element,
    buttons,
    getActive: () => active,
    setActive(id: T) {
      active = id;
      sync();
    },
    dispose() {
      for (const cleanup of cleanups.splice(0)) cleanup();
    },
  };
}

export type PagerOptions = {
  readonly previousLabel: string;
  readonly nextLabel: string;
  readonly onPageChange: (page: number) => void;
};

export type Pager = {
  readonly element: HTMLDivElement;
  readonly previousButton: HTMLButtonElement;
  readonly nextButton: HTMLButtonElement;
  readonly meta: HTMLSpanElement;
  update(state: { readonly page: number; readonly pageSize: number; readonly total: number }): void;
  dispose(): void;
};

export function createPager(options: PagerOptions): Pager {
  let currentPage = 0;
  let totalPages = 1;

  const previousButton = el("button", {
    className: "anyfile-inspector__btn",
    attrs: { type: "button" },
    dataset: { previous: "", action: "previous" },
  }, options.previousLabel);
  const meta = el("span", { className: "anyfile-inspector__pager-meta", dataset: { meta: "" } });
  const nextButton = el("button", {
    className: "anyfile-inspector__btn",
    attrs: { type: "button" },
    dataset: { next: "", action: "next" },
  }, options.nextLabel);

  const onPrevious = () => {
    if (currentPage > 0) options.onPageChange(currentPage - 1);
  };
  const onNext = () => {
    if (currentPage < totalPages - 1) options.onPageChange(currentPage + 1);
  };
  previousButton.addEventListener("click", onPrevious);
  nextButton.addEventListener("click", onNext);

  const element = el("div", "anyfile-inspector__pager", previousButton, meta, nextButton);
  return {
    element,
    previousButton,
    nextButton,
    meta,
    update({ page, pageSize, total }) {
      totalPages = Math.max(1, Math.ceil(total / pageSize));
      currentPage = Math.max(0, Math.min(page, totalPages - 1));
      const start = currentPage * pageSize;
      const end = Math.min(start + pageSize, total);
      meta.textContent = total === 0 ? "0" : `${start + 1}–${end} / ${total}`;
      previousButton.disabled = currentPage === 0;
      nextButton.disabled = currentPage >= totalPages - 1;
    },
    dispose() {
      previousButton.removeEventListener("click", onPrevious);
      nextButton.removeEventListener("click", onNext);
    },
  };
}
