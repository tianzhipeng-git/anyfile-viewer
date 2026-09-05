import { ViewerError, type Locale } from "@anyfile/viewer-protocol";
import { checkBookAbort, type BookZip } from "@anyfile/archive-metadata-viewer/zip-source";
import { inspectImageFile, decodeImage } from "@anyfile/browser-image-viewer/decode";
import { COMIC_LIMITS, comicSpreads, type ComicPage } from "./model";
import { comicButton, comicCopy, comicSelect } from "./ui";

export function createComicViewport(
  root: HTMLElement,
  zip: BookZip,
  pages: ComicPage[],
  initialRtl: boolean,
  locale: Locale,
) {
  const copy = comicCopy(locale),
    spreads = comicSpreads(pages);
  const toolbar = document.createElement("div");
  toolbar.className = "anyfile-comic-reader__toolbar";
  const viewport = document.createElement("div");
  viewport.className = "anyfile-comic-reader__viewport";
  viewport.tabIndex = 0;
  viewport.setAttribute("aria-label", copy.page);
  const style = document.createElement("style");
  style.textContent = `
.anyfile-comic-reader{height:100%;min-height:0;width:100%;display:flex;flex-direction:column;overflow:hidden;color:var(--viewer-foreground);background:var(--viewer-background);font-family:var(--viewer-font-family)}
.anyfile-comic-reader__toolbar{display:flex;flex-wrap:wrap;gap:8px;padding:10px;flex:none;border-bottom:1px solid var(--viewer-border)}
.anyfile-comic-reader__toolbar button,.anyfile-comic-reader__toolbar select,.anyfile-comic-reader__toolbar input{padding:5px;border:1px solid var(--viewer-border);border-radius:5px;color:inherit;background:var(--viewer-background)}
.anyfile-comic-reader__toolbar input{width:6em}.anyfile-comic-reader__viewport{min-height:0;flex:1;overflow:auto;position:relative;overflow-anchor:none;outline-offset:-3px}
.anyfile-comic-reader__pages{display:flex;align-items:flex-start;justify-content:center;min-height:100%}.anyfile-comic-reader__pages[data-continuous=true]{display:block}
.anyfile-comic-reader__page{margin:0;flex:1;min-width:0;text-align:center;min-height:200px}.anyfile-comic-reader__page img{display:block;margin:0 auto;object-fit:contain}.anyfile-comic-reader :focus-visible{outline:2px solid var(--viewer-accent)}
`;
  const content = document.createElement("div");
  content.className = "anyfile-comic-reader__pages";
  viewport.append(content);
  let current = 0,
    mode = "single",
    rtl = initialRtl,
    fit = "width",
    zoom = 1,
    disposed = false,
    request = 0;
  const slots = pages.map((page) => {
    const slot = document.createElement("figure");
    slot.className = "anyfile-comic-reader__page";
    slot.setAttribute("aria-label", page.path);
    return slot;
  });
  const active = new Map<
    number,
    { abort: AbortController; image: HTMLImageElement; url?: string }
  >();
  function spread() {
    return spreads.find((group) => group.includes(current))!;
  }
  function visible() {
    return mode === "double" ? spread() : [current];
  }
  function jump(index: number) {
    current = Math.max(0, Math.min(pages.length - 1, index));
    refresh();
    viewport.scrollTop = mode === "continuous" ? slots[current].offsetTop : 0;
  }
  function turn(delta: number) {
    if (mode === "double") {
      const group = spread();
      jump(delta > 0 ? group[group.length - 1] + 1 : group[0] - 1);
    } else jump(current + delta);
  }
  const previous = comicButton(copy.previous, () => turn(-1)),
    next = comicButton(copy.next, () => turn(1));
  const pageInput = document.createElement("input");
  pageInput.type = "number";
  pageInput.min = "1";
  pageInput.max = String(pages.length);
  pageInput.setAttribute("aria-label", copy.page);
  pageInput.onchange = () => {
    const value = Number(pageInput.value);
    if (Number.isInteger(value) && value >= 1 && value <= pages.length) jump(value - 1);
    else pageInput.value = String(current + 1);
  };
  const count = document.createElement("span");
  count.textContent = `/ ${pages.length}`;
  const modes = comicSelect(
    copy.mode,
    [
      ["single", copy.single],
      ["double", copy.double],
      ["continuous", copy.continuous],
    ],
    (value) => {
      mode = value;
      jump(current);
    },
  );
  const directions = comicSelect(
    copy.direction,
    [
      ["ltr", copy.ltr],
      ["rtl", copy.rtl],
    ],
    (value) => {
      rtl = value === "rtl";
      refresh();
    },
  );
  directions.value = rtl ? "rtl" : "ltr";
  toolbar.append(
    previous,
    next,
    pageInput,
    count,
    modes,
    directions,
    comicSelect(
      copy.fit,
      [
        ["width", copy.width],
        ["height", copy.height],
      ],
      (value) => {
        fit = value;
        resize();
      },
    ),
    comicSelect(
      copy.zoom,
      [
        ["1", "100%"],
        ["1.5", "150%"],
        ["2", "200%"],
        ["0.75", "75%"],
      ],
      (value) => {
        zoom = Number(value);
        resize();
      },
    ),
  );
  root.append(style, toolbar, viewport);
  function sizeImage(index: number, image: HTMLImageElement) {
    if (!image.naturalWidth || !image.naturalHeight) return;
    const oldHeight = slots[index].getBoundingClientRect().height;
    const width = Math.max(1, viewport.clientWidth / (mode === "double" ? visible().length : 1));
    const ratio = image.naturalWidth / image.naturalHeight || 0.7;
    const displayedWidth =
      (fit === "width" ? width : Math.max(1, viewport.clientHeight) * ratio) * zoom;
    image.style.width = `${displayedWidth}px`;
    image.style.height = "auto";
    if (mode === "continuous") {
      slots[index].style.height = `${displayedWidth / ratio}px`;
      if (index < current)
        viewport.scrollTop += slots[index].getBoundingClientRect().height - oldHeight;
    }
  }
  function resize() {
    const fraction = Math.max(
      0,
      (viewport.scrollTop - slots[current].offsetTop) / Math.max(1, slots[current].offsetHeight),
    );
    for (const [index, state] of active) sizeImage(index, state.image);
    if (mode === "continuous")
      viewport.scrollTop = slots[current].offsetTop + fraction * slots[current].offsetHeight;
  }
  function unload(index: number) {
    const state = active.get(index);
    if (!state) return;
    state.abort.abort();
    state.image.removeAttribute("src");
    state.image.remove();
    if (state.url) URL.revokeObjectURL(state.url);
    active.delete(index);
  }
  async function load(index: number) {
    const image = document.createElement("img");
    image.alt = `${index + 1} · ${pages[index].path}`;
    const state: { abort: AbortController; image: HTMLImageElement; url?: string } = {
      abort: new AbortController(),
      image,
    };
    active.set(index, state);
    slots[index].textContent = copy.loading;
    try {
      const bytes = await zip.read(pages[index].path, COMIC_LIMITS.pageBytes, state.abort.signal);
      const info = inspectImageFile(bytes);
      if (
        !info?.width ||
        !info.height ||
        !["JPEG", "PNG", "APNG", "GIF", "WebP", "AVIF"].includes(info.format)
      )
        throw new ViewerError("invalid-file", copy.invalid);
      if (
        (info.animated && !info.frameCount) ||
        info.width * info.height * (info.frameCount ?? 1) > COMIC_LIMITS.pixels
      )
        throw new ViewerError("resource-limit", copy.limit);
      checkBookAbort(state.abort.signal);
      state.url = URL.createObjectURL(new Blob([bytes.slice().buffer as ArrayBuffer]));
      await decodeImage(image, state.url, state.abort.signal);
      checkBookAbort(state.abort.signal);
      if (disposed) return;
      if (image.naturalWidth * image.naturalHeight > COMIC_LIMITS.pixels)
        throw new ViewerError("resource-limit", copy.limit);
      sizeImage(index, image);
      slots[index].replaceChildren(image);
    } catch (error) {
      if (disposed || state.abort.signal.aborted) return;
      image.removeAttribute("src");
      if (state.url) {
        URL.revokeObjectURL(state.url);
        state.url = undefined;
      }
      slots[index].textContent =
        error instanceof ViewerError && error.code === "resource-limit" ? copy.limit : copy.invalid;
      slots[index].setAttribute("role", "alert");
    }
  }
  function refresh() {
    const selected = visible();
    pageInput.value = String(current + 1);
    previous.disabled = selected[0] === 0;
    next.disabled = selected[selected.length - 1] === pages.length - 1;
    content.dataset.continuous = String(mode === "continuous");
    content.style.flexDirection = rtl ? "row-reverse" : "row";
    if (mode === "continuous") {
      if (content.children.length !== slots.length) content.replaceChildren(...slots);
    } else content.replaceChildren(...selected.map((index) => slots[index]));
    const desired = new Set(
      [...selected, selected[0] - 1, selected[selected.length - 1] + 1].filter(
        (index) => index >= 0 && index < pages.length,
      ),
    );
    for (const index of active.keys()) if (!desired.has(index)) unload(index);
    for (const index of desired) if (!active.has(index)) void load(index);
    resize();
  }
  viewport.onscroll = () => {
    if (mode !== "continuous" || request) return;
    request = requestAnimationFrame(() => {
      request = 0;
      if (disposed) return;
      const index = slots.findIndex(
        (slot) => slot.offsetTop + slot.offsetHeight > viewport.scrollTop + 30,
      );
      if (index >= 0 && index !== current) {
        current = index;
        refresh();
      }
    });
  };
  viewport.onkeydown = (event) => {
    let delta = 0;
    if (event.key === "ArrowRight") delta = rtl ? -1 : 1;
    if (event.key === "ArrowLeft") delta = rtl ? 1 : -1;
    if (event.key === "PageDown") delta = 1;
    if (event.key === "PageUp") delta = -1;
    if (delta) {
      event.preventDefault();
      turn(delta);
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      jump(event.key === "Home" ? 0 : pages.length - 1);
    }
  };
  const observer = new ResizeObserver(resize);
  observer.observe(viewport);
  refresh();
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(request);
      observer.disconnect();
      viewport.onscroll = null;
      viewport.onkeydown = null;
      for (const index of active.keys()) unload(index);
      root.replaceChildren();
    },
  };
}
