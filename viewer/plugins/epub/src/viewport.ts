import { ViewerError, type Locale } from "@anyfile/viewer-protocol";
import { type BookZip } from "@anyfile/archive-metadata-viewer/zip-source";
import { prepareChapter, type SafeChapter } from "./safe-content";
import { type Publication } from "./publication";
import { button, epubCopy, select } from "./ui";

export function createPublicationViewport(
  root: HTMLElement,
  zip: BookZip,
  book: Publication,
  locale: Locale,
) {
  const copy = epubCopy(locale);
  const title = document.createElement("span");
  title.textContent = [book.title, book.author].filter(Boolean).join(" · ");
  const toolbar = document.createElement("div");
  toolbar.className = "anyfile-epub-reader__toolbar";
  const viewport = document.createElement("div");
  viewport.className = "anyfile-epub-reader__viewport";
  viewport.tabIndex = 0;
  viewport.setAttribute("aria-label", book.title || copy.contents);
  const style = document.createElement("style");
  style.textContent = `
.anyfile-epub-reader{height:100%;min-height:0;width:100%;display:flex;flex-direction:column;overflow:hidden;color:var(--viewer-foreground);background:var(--viewer-background);font-family:var(--viewer-font-family)}
.anyfile-epub-reader__toolbar{display:flex;flex-wrap:wrap;gap:8px;padding:10px;border-bottom:1px solid var(--viewer-border);flex:none}
.anyfile-epub-reader__toolbar select{max-width:240px}.anyfile-epub-reader__toolbar button,.anyfile-epub-reader__toolbar select{color:inherit;background:var(--viewer-background);border:1px solid var(--viewer-border);border-radius:5px;padding:5px}
.anyfile-epub-reader__viewport{flex:1;min-height:0;overflow:auto;position:relative;overflow-anchor:none}.anyfile-epub-reader__chapter{box-sizing:border-box;min-height:400px;border-bottom:1px solid var(--viewer-border)}
.anyfile-epub-reader__chapter iframe{display:block;width:100%;border:0}.anyfile-epub-reader__toolbar :focus-visible{outline:2px solid var(--viewer-accent)}
`;
  let current = 0,
    size = 18,
    spacing = 1.7,
    width = 760,
    dark = false,
    disposed = false,
    frameRequest = 0;
  let pending: { index: number; fragment: string } | undefined;
  const active = new Map<
    number,
    {
      abort: AbortController;
      frame?: HTMLIFrameElement;
      chapter?: SafeChapter;
      resize?: ResizeObserver;
    }
  >();
  const slots = book.spine.map((item) => {
    const slot = document.createElement("section");
    slot.className = "anyfile-epub-reader__chapter";
    slot.setAttribute("aria-label", item.id);
    viewport.append(slot);
    return slot;
  });
  function userStyles(frame: HTMLIFrameElement) {
    const doc = frame.contentDocument;
    if (!doc) return;
    const element = doc.getElementById("book-reader-style");
    if (element)
      element.textContent = `html{background:${dark ? "#171717" : "#fff"};color:${dark ? "#eee" : "#202020"}}body{box-sizing:border-box;max-width:${width}px;margin:0 auto;padding:24px;font-size:${size}px!important;line-height:${spacing}!important;overflow-wrap:anywhere}body *{max-width:100%;line-height:inherit!important;${dark ? "color:inherit!important;background-color:transparent!important" : ""}}img{height:auto}table{max-width:100%}a{color:${dark ? "#93c5fd" : "#1d4ed8"}}`;
  }
  function position() {
    const doc = active.get(current)?.frame?.contentDocument;
    if (!doc) return undefined;
    const top = viewport.scrollTop - slots[current].offsetTop;
    const nodes = Array.from(doc.body.querySelectorAll("[id],p,h1,h2,h3,li"));
    const node = nodes.find((element) => element.getBoundingClientRect().bottom >= top);
    return node ? { node, index: current } : undefined;
  }
  function typography() {
    const anchor = position();
    for (const state of active.values())
      if (state.frame) {
        userStyles(state.frame);
        const body = state.frame.contentDocument?.body;
        if (body)
          state.frame.style.height = `${Math.max(400, Math.ceil(body.getBoundingClientRect().height))}px`;
      }
    if (anchor)
      viewport.scrollTop = slots[anchor.index].offsetTop + anchor.node.getBoundingClientRect().top;
  }
  function jump(index: number, fragment = "") {
    current = Math.max(0, Math.min(slots.length - 1, index));
    pending = { index: current, fragment };
    viewport.scrollTop = slots[current].offsetTop;
    refresh();
    goToAnchor();
  }
  function goToAnchor() {
    if (!pending) return;
    const frame = active.get(pending.index)?.frame,
      doc = frame?.contentDocument;
    if (!doc?.getElementById("book-reader-style")) return;
    const element = pending.fragment ? doc.getElementById(pending.fragment) : doc.body;
    viewport.scrollTop =
      slots[pending.index].offsetTop + (element?.getBoundingClientRect().top ?? 0);
    pending = undefined;
  }
  const previous = button(copy.previous, () => jump(current - 1));
  const next = button(copy.next, () => jump(current + 1));
  const toc = select(
    copy.contents,
    book.toc.map((item, index) => [String(index), item.label]),
    (value) => {
      const item = book.toc[Number(value)];
      jump(
        book.spine.findIndex((chapter) => chapter.path === item.path),
        item.fragment,
      );
    },
  );
  const font = select(
    copy.size,
    [16, 18, 22, 26, 30].map((value) => [String(value), `${value}px`]),
    (value) => {
      size = Number(value);
      typography();
    },
  );
  font.value = "18";
  const line = select(
    copy.spacing,
    [1.4, 1.7, 2].map((value) => [String(value), String(value)]),
    (value) => {
      spacing = Number(value);
      typography();
    },
  );
  line.value = "1.7";
  const measure = select(
    copy.width,
    [560, 760, 960].map((value) => [String(value), `${value}px`]),
    (value) => {
      width = Number(value);
      typography();
    },
  );
  measure.value = "760";
  toolbar.append(
    title,
    previous,
    next,
    toc,
    font,
    line,
    measure,
    select(
      copy.theme,
      [
        ["light", copy.light],
        ["dark", copy.dark],
      ],
      (value) => {
        dark = value === "dark";
        typography();
      },
    ),
  );
  root.append(style, toolbar, viewport);
  function unload(index: number) {
    const state = active.get(index);
    if (!state) return;
    state.abort.abort();
    state.resize?.disconnect();
    slots[index].style.height = `${Math.max(400, slots[index].getBoundingClientRect().height)}px`;
    if (state.frame) {
      state.frame.onload = null;
      state.frame.remove();
    }
    state.chapter?.dispose();
    slots[index].replaceChildren();
    active.delete(index);
  }
  async function load(index: number) {
    const state: {
      abort: AbortController;
      frame?: HTMLIFrameElement;
      chapter?: SafeChapter;
      resize?: ResizeObserver;
    } = { abort: new AbortController() };
    active.set(index, state);
    const slot = slots[index];
    slot.textContent = copy.loading;
    try {
      const chapter = await prepareChapter(zip, book, book.spine[index].path, state.abort.signal);
      if (state.abort.signal.aborted || disposed) {
        chapter.dispose();
        return;
      }
      state.chapter = chapter;
      const frame = document.createElement("iframe");
      state.frame = frame;
      frame.setAttribute("sandbox", "allow-same-origin");
      frame.title = book.spine[index].id;
      frame.referrerPolicy = "no-referrer";
      frame.onload = () => {
        if (disposed || state.abort.signal.aborted) return;
        const doc = frame.contentDocument;
        if (!doc) return;
        userStyles(frame);
        const resize = () => {
          if (disposed || state.abort.signal.aborted) return;
          const oldHeight = slot.getBoundingClientRect().height;
          frame.style.height = `${Math.max(400, Math.ceil(doc.body.getBoundingClientRect().height))}px`;
          slot.style.height = "auto";
          if (index < current)
            viewport.scrollTop += slot.getBoundingClientRect().height - oldHeight;
          goToAnchor();
        };
        state.resize = new ResizeObserver(resize);
        state.resize.observe(doc.body);
        resize();
        doc.addEventListener("click", (event) => {
          event.preventDefault();
          const link = (event.target as Element).closest?.("a[data-book-link]");
          if (!link) return;
          const target = chapter.links[Number(link.getAttribute("data-book-link"))];
          if (target)
            jump(
              book.spine.findIndex((item) => item.path === target.path),
              target.fragment,
            );
        });
      };
      frame.srcdoc = chapter.html;
      slot.replaceChildren(frame);
      if (chapter.missingResources) {
        const warning = document.createElement("p");
        warning.setAttribute("role", "status");
        warning.textContent = copy.missing;
        slot.prepend(warning);
      }
    } catch (error) {
      if (disposed || state.abort.signal.aborted) return;
      slot.textContent =
        error instanceof ViewerError && error.code === "resource-limit"
          ? copy.limit
          : error instanceof ViewerError && error.code === "missing-related-file"
            ? copy.missing
            : copy.invalid;
      slot.setAttribute("role", "alert");
    }
  }
  function refresh() {
    previous.disabled = current === 0;
    next.disabled = current === slots.length - 1;
    const tocIndex = book.toc.findIndex((item) => item.path === book.spine[current].path);
    if (tocIndex >= 0) toc.value = String(tocIndex);
    for (const index of active.keys()) if (Math.abs(index - current) > 1) unload(index);
    for (const index of [current, current - 1, current + 1])
      if (index >= 0 && index < slots.length && !active.has(index)) void load(index);
  }
  viewport.onscroll = () => {
    if (frameRequest) return;
    frameRequest = requestAnimationFrame(() => {
      frameRequest = 0;
      if (disposed || pending) return;
      const center = viewport.scrollTop + Math.min(100, viewport.clientHeight / 2);
      const index = slots.findIndex((slot) => slot.offsetTop + slot.offsetHeight > center);
      if (index >= 0 && index !== current) {
        current = index;
        refresh();
      }
    });
  };
  viewport.onkeydown = (event) => {
    if (event.key === "PageDown" && event.altKey) {
      event.preventDefault();
      jump(current + 1);
    }
    if (event.key === "PageUp" && event.altKey) {
      event.preventDefault();
      jump(current - 1);
    }
  };
  refresh();
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frameRequest);
      viewport.onscroll = null;
      viewport.onkeydown = null;
      for (const index of active.keys()) unload(index);
      root.replaceChildren();
    },
  };
}
