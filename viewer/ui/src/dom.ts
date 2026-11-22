export type ElChild = Node | string | number | null | undefined | false;

export type ElProps = {
  readonly className?: string;
  readonly text?: string;
  readonly title?: string;
  readonly role?: string;
  readonly hidden?: boolean;
  readonly attrs?: Readonly<Record<string, string | boolean | undefined>>;
  readonly dataset?: Readonly<Record<string, string | undefined>>;
};

export type FormatBytesOptions = {
  readonly maximumFractionDigits?: number;
  readonly empty?: string;
};

/** Safe DOM builder: always writes strings as text nodes, never via innerHTML. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: ElProps | string,
  ...children: readonly ElChild[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (typeof props === "string") {
    if (props) element.className = props;
  } else if (props) {
    if (props.className) element.className = props.className;
    if (props.title !== undefined) element.title = props.title;
    if (props.role !== undefined) element.setAttribute("role", props.role);
    if (props.hidden !== undefined) element.hidden = props.hidden;
    if (props.dataset) {
      for (const [key, value] of Object.entries(props.dataset)) {
        if (value !== undefined) element.dataset[key] = value;
      }
    }
    if (props.attrs) {
      for (const [key, value] of Object.entries(props.attrs)) {
        if (value === undefined || value === false) continue;
        element.setAttribute(key, value === true ? "" : value);
      }
    }
    if (props.text !== undefined) element.textContent = props.text;
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    element.append(typeof child === "string" || typeof child === "number" ? document.createTextNode(String(child)) : child);
  }
  return element;
}

const BYTE_UNITS = ["KiB", "MiB", "GiB", "TiB", "PiB"] as const;

export function formatBytes(
  value: number | undefined,
  locale: string = "en",
  options: FormatBytesOptions = {},
): string {
  const empty = options.empty ?? "—";
  if (value === undefined || !Number.isFinite(value) || value < 0) return empty;
  if (value < 1024) return `${Math.round(value)} B`;
  let size = value;
  let unit = -1;
  do {
    size /= 1024;
    unit += 1;
  } while (size >= 1024 && unit < BYTE_UNITS.length - 1);
  const digits = options.maximumFractionDigits ?? 2;
  return `${size.toLocaleString(locale, { maximumFractionDigits: digits })} ${BYTE_UNITS[unit]}`;
}
