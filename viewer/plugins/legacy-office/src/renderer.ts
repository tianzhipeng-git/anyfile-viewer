import { selectMessages, type Locale } from "@anyfile/viewer-protocol";
import type { LegacyDocument, LegacyOfficeModel, LegacyPresentation } from "./model";
import { buildMetadataPanel, renderBlocks, VIEWER_STYLES } from "./styles";

export interface RenderedViewer {
  readonly root: HTMLElement;
  dispose(): void;
}

function getUiCopy(locale: Locale) {
  return selectMessages(locale, {
    "zh-CN": {
      metadata: "文档信息",
      title: "标题",
      author: "作者",
      subject: "主题",
      company: "单位",
      keywords: "关键词",
      created: "创建日期",
      modified: "修改日期",
      outline: "目录导航",
      jumpToSection: "跳转到章节",
      zoomOut: "缩小",
      zoomIn: "放大",
      resetZoom: "重置缩放",
      footnotes: "脚注",
      emptyDocument: "文档不包含可显示的文本或图片。",
      emptySlides: "演示文稿不包含可显示的幻灯片。",
      truncatedWarning: "文档过大，已按浏览器安全预算截断部分末尾内容。",
      slideLabel: "幻灯片",
      prevSlide: "上一页",
      nextSlide: "下一页",
      allSlides: "全部幻灯片",
      singleSlide: "单页视图",
      notes: "演讲者备注",
      embeddedImage: "内嵌图片",
      pageBreak: "分页符",
    },
    en: {
      metadata: "Document info",
      title: "Title",
      author: "Author",
      subject: "Subject",
      company: "Company",
      keywords: "Keywords",
      created: "Created",
      modified: "Modified",
      outline: "Outline",
      jumpToSection: "Jump to section",
      zoomOut: "Zoom out",
      zoomIn: "Zoom in",
      resetZoom: "Reset zoom",
      footnotes: "Footnotes",
      emptyDocument: "This document contains no displayable text or images.",
      emptySlides: "This presentation contains no displayable slides.",
      truncatedWarning: "Content was truncated to stay within the browser safety budget.",
      slideLabel: "Slide",
      prevSlide: "Previous",
      nextSlide: "Next",
      allSlides: "All slides",
      singleSlide: "Single slide",
      notes: "Speaker notes",
      embeddedImage: "Embedded image",
      pageBreak: "Page break",
    },
  });
}

export function renderLegacyOffice(
  model: LegacyOfficeModel,
  fileName: string,
  locale: Locale,
): RenderedViewer {
  const copy = getUiCopy(locale);
  const objectUrls: string[] = [];
  const imageUrls = model.images.map((img) => {
    const url = URL.createObjectURL(new Blob([new Uint8Array(img.bytes)], { type: img.mimeType }));
    objectUrls.push(url);
    return url;
  });

  const cleanups: Array<() => void> = [];
  const root = document.createElement("div");
  root.className = "anyfile-legacy-office-viewer";
  const style = document.createElement("style");
  style.textContent = VIEWER_STYLES;

  const toolbar = document.createElement("div");
  toolbar.className = "anyfile-legacy-office__toolbar";
  const nameEl = document.createElement("strong");
  nameEl.className = "anyfile-legacy-office__name";
  nameEl.textContent = fileName;
  nameEl.title = fileName;
  const badge = document.createElement("span");
  badge.className = "anyfile-legacy-office__badge";
  badge.textContent = model.format;
  const spacer = document.createElement("div");
  spacer.className = "anyfile-legacy-office__spacer";
  const controls = document.createElement("div");
  controls.className = "anyfile-legacy-office__controls";
  toolbar.append(nameEl, badge, spacer, controls);

  const metaPanel = buildMetadataPanel(model.metadata, copy);
  if (metaPanel) {
    const metaBtn = document.createElement("button");
    metaBtn.type = "button";
    metaBtn.className = "anyfile-legacy-office__btn";
    metaBtn.textContent = copy.metadata;
    metaBtn.setAttribute("aria-pressed", "false");
    const toggleMeta = () => {
      metaPanel.hidden = !metaPanel.hidden;
      metaBtn.setAttribute("aria-pressed", String(!metaPanel.hidden));
    };
    metaBtn.addEventListener("click", toggleMeta);
    cleanups.push(() => metaBtn.removeEventListener("click", toggleMeta));
    controls.append(metaBtn);
  }

  root.append(style, toolbar);
  if (metaPanel) root.append(metaPanel);

  if (model.truncated) {
    const banner = document.createElement("div");
    banner.className = "anyfile-legacy-office__banner";
    banner.setAttribute("role", "status");
    banner.textContent = copy.truncatedWarning;
    root.append(banner);
  }

  const body = document.createElement("div");
  body.className = "anyfile-legacy-office__body";
  root.append(body);

  if (model.kind === "document") {
    mountDocumentView(model, body, controls, imageUrls, copy, cleanups);
  } else {
    mountPresentationView(model, body, controls, imageUrls, copy, cleanups);
  }

  let disposed = false;
  return {
    root,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const cleanup of cleanups) cleanup();
      for (const url of objectUrls) URL.revokeObjectURL(url);
      root.remove();
    },
  };
}

function mountDocumentView(
  doc: LegacyDocument,
  body: HTMLElement,
  controls: HTMLElement,
  imageUrls: readonly string[],
  copy: ReturnType<typeof getUiCopy>,
  cleanups: Array<() => void>,
) {
  const paper = document.createElement("article");
  paper.className = "anyfile-legacy-office__paper";
  const headings: Array<{ id: string; label: string }> = [];

  if (doc.blocks.length === 0 && doc.footnotes.length === 0) {
    const empty = document.createElement("p");
    empty.className = "anyfile-legacy-office__empty";
    empty.textContent = copy.emptyDocument;
    paper.append(empty);
  } else {
    renderBlocks(paper, doc.blocks, imageUrls, copy, headings);
    if (doc.footnotes.length > 0) {
      const ftSection = document.createElement("section");
      ftSection.className = "anyfile-legacy-office__footnotes";
      const ftTitle = document.createElement("h2");
      ftTitle.textContent = copy.footnotes;
      ftSection.append(ftTitle);
      renderBlocks(ftSection, doc.footnotes, imageUrls, copy);
      paper.append(ftSection);
    }
  }

  if (headings.length > 0) {
    const select = document.createElement("select");
    select.className = "anyfile-legacy-office__select";
    select.setAttribute("aria-label", copy.jumpToSection);
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = copy.outline;
    select.append(placeholder);
    for (const h of headings) {
      const opt = document.createElement("option");
      opt.value = h.id;
      opt.textContent = h.label;
      select.append(opt);
    }
    const onSelect = () => {
      if (!select.value) return;
      const target = paper.querySelector(`[id="${select.value}"]`);
      target?.scrollIntoView?.({ behavior: "smooth", block: "start" });
      select.value = "";
    };
    select.addEventListener("change", onSelect);
    cleanups.push(() => select.removeEventListener("change", onSelect));
    controls.prepend(select);
  }

  let zoom = 100;
  const zoomOutBtn = document.createElement("button");
  zoomOutBtn.type = "button";
  zoomOutBtn.className = "anyfile-legacy-office__btn";
  zoomOutBtn.textContent = "−";
  zoomOutBtn.setAttribute("aria-label", copy.zoomOut);

  const zoomResetBtn = document.createElement("button");
  zoomResetBtn.type = "button";
  zoomResetBtn.className = "anyfile-legacy-office__btn";
  zoomResetBtn.textContent = "100%";
  zoomResetBtn.setAttribute("aria-label", copy.resetZoom);

  const zoomInBtn = document.createElement("button");
  zoomInBtn.type = "button";
  zoomInBtn.className = "anyfile-legacy-office__btn";
  zoomInBtn.textContent = "+";
  zoomInBtn.setAttribute("aria-label", copy.zoomIn);

  const applyZoom = (next: number) => {
    zoom = Math.max(80, Math.min(160, next));
    paper.style.fontSize = `${zoom}%`;
    zoomResetBtn.textContent = `${zoom}%`;
    zoomOutBtn.disabled = zoom <= 80;
    zoomInBtn.disabled = zoom >= 160;
  };
  const dec = () => applyZoom(zoom - 10);
  const rst = () => applyZoom(100);
  const inc = () => applyZoom(zoom + 10);
  zoomOutBtn.addEventListener("click", dec);
  zoomResetBtn.addEventListener("click", rst);
  zoomInBtn.addEventListener("click", inc);
  cleanups.push(
    () => zoomOutBtn.removeEventListener("click", dec),
    () => zoomResetBtn.removeEventListener("click", rst),
    () => zoomInBtn.removeEventListener("click", inc),
  );
  controls.append(zoomOutBtn, zoomResetBtn, zoomInBtn);
  body.append(paper);
}

function mountPresentationView(
  pres: LegacyPresentation,
  body: HTMLElement,
  controls: HTMLElement,
  imageUrls: readonly string[],
  copy: ReturnType<typeof getUiCopy>,
  cleanups: Array<() => void>,
) {
  if (pres.slides.length === 0) {
    const empty = document.createElement("div");
    empty.className = "anyfile-legacy-office__empty";
    empty.textContent = copy.emptySlides;
    body.append(empty);
    return;
  }

  let singleMode = false;
  let activeIndex = 0;
  let showNotes = true;
  const hasNotes = pres.slides.some((s) => s.notes.length > 0);

  const slidesContainer = document.createElement("div");
  slidesContainer.className = "anyfile-legacy-office__slides";
  body.append(slidesContainer);

  const prevBtn = document.createElement("button");
  prevBtn.type = "button";
  prevBtn.className = "anyfile-legacy-office__btn";
  prevBtn.textContent = copy.prevSlide;

  const slideSelect = document.createElement("select");
  slideSelect.className = "anyfile-legacy-office__select";
  slideSelect.setAttribute("aria-label", copy.slideLabel);
  pres.slides.forEach((s, idx) => {
    const opt = document.createElement("option");
    opt.value = String(idx);
    opt.textContent = s.title ? `${s.index}/${pres.slides.length}: ${s.title}` : `${copy.slideLabel} ${s.index}/${pres.slides.length}`;
    slideSelect.append(opt);
  });

  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "anyfile-legacy-office__btn";
  nextBtn.textContent = copy.nextSlide;

  const modeBtn = document.createElement("button");
  modeBtn.type = "button";
  modeBtn.className = "anyfile-legacy-office__btn";
  modeBtn.textContent = copy.singleSlide;
  modeBtn.setAttribute("aria-pressed", "false");

  const cardEls: HTMLElement[] = [];
  const noteEls: HTMLElement[] = [];

  for (const slide of pres.slides) {
    const card = document.createElement("section");
    card.className = "anyfile-legacy-office__slide-card";
    const header = document.createElement("div");
    header.className = "anyfile-legacy-office__slide-header";
    const label = document.createElement("span");
    label.textContent = `${copy.slideLabel} ${slide.index} / ${pres.slides.length}`;
    const titleSpan = document.createElement("span");
    titleSpan.textContent = slide.title ?? "";
    header.append(label, titleSpan);
    card.append(header);

    const positionedShapes = slide.shapes.filter((sh) => sh.hasBounds);
    const unpositionedShapes = slide.shapes.filter((sh) => !sh.hasBounds);

    if (positionedShapes.length > 0) {
      const stage = document.createElement("div");
      stage.className = "anyfile-legacy-office__slide-stage";
      stage.style.aspectRatio = `${pres.slideWidth} / ${pres.slideHeight}`;
      if (slide.backgroundColor) stage.style.background = slide.backgroundColor;

      for (const sh of positionedShapes) {
        const box = document.createElement("div");
        box.className = "anyfile-legacy-office__slide-shape";
        box.style.left = `${(sh.x / pres.slideWidth) * 100}%`;
        box.style.top = `${(sh.y / pres.slideHeight) * 100}%`;
        box.style.width = `${Math.min(100, (sh.w / pres.slideWidth) * 100)}%`;
        box.style.height = `${Math.min(100, (sh.h / pres.slideHeight) * 100)}%`;
        if (sh.fillColor) box.style.background = sh.fillColor;
        if (sh.borderColor) box.style.border = `1px solid ${sh.borderColor}`;
        if (sh.imageIndex !== undefined && imageUrls[sh.imageIndex]) {
          const img = document.createElement("img");
          img.className = "anyfile-legacy-office__img";
          img.style.width = "100%";
          img.style.height = "100%";
          img.style.objectFit = "contain";
          img.style.margin = "0";
          img.src = imageUrls[sh.imageIndex]!;
          img.alt = copy.embeddedImage;
          box.append(img);
        }
        renderBlocks(box, sh.paragraphs, imageUrls, copy, undefined, 0.72);
        stage.append(box);
      }
      card.append(stage);
    }

    if (unpositionedShapes.length > 0 || slide.fallbackParagraphs.length > 0 || positionedShapes.length === 0) {
      const fallback = document.createElement("div");
      fallback.className = "anyfile-legacy-office__slide-fallback";
      for (const sh of unpositionedShapes) {
        renderBlocks(fallback, sh.paragraphs, imageUrls, copy);
      }
      if (slide.fallbackParagraphs.length > 0) {
        renderBlocks(fallback, slide.fallbackParagraphs, imageUrls, copy);
      }
      if (fallback.childNodes.length > 0) card.append(fallback);
    }

    if (slide.notes.length > 0) {
      const notesEl = document.createElement("div");
      notesEl.className = "anyfile-legacy-office__slide-notes";
      const notesHeading = document.createElement("strong");
      notesHeading.textContent = `${copy.notes}: `;
      notesEl.append(notesHeading);
      renderBlocks(notesEl, slide.notes, imageUrls, copy);
      card.append(notesEl);
      noteEls.push(notesEl);
    }

    cardEls.push(card);
    slidesContainer.append(card);
  }

  const updateView = () => {
    slideSelect.value = String(activeIndex);
    prevBtn.disabled = activeIndex <= 0;
    nextBtn.disabled = activeIndex >= pres.slides.length - 1;
    cardEls.forEach((card, idx) => {
      card.hidden = singleMode && idx !== activeIndex;
    });
    for (const n of noteEls) n.hidden = !showNotes;
  };

  const go = (idx: number) => {
    activeIndex = Math.max(0, Math.min(pres.slides.length - 1, idx));
    updateView();
    if (!singleMode) cardEls[activeIndex]?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };

  const onPrev = () => go(activeIndex - 1);
  const onNext = () => go(activeIndex + 1);
  const onSelect = () => go(Number(slideSelect.value));
  const onToggleMode = () => {
    singleMode = !singleMode;
    modeBtn.textContent = singleMode ? copy.allSlides : copy.singleSlide;
    modeBtn.setAttribute("aria-pressed", String(singleMode));
    updateView();
  };

  prevBtn.addEventListener("click", onPrev);
  nextBtn.addEventListener("click", onNext);
  slideSelect.addEventListener("change", onSelect);
  modeBtn.addEventListener("click", onToggleMode);
  cleanups.push(
    () => prevBtn.removeEventListener("click", onPrev),
    () => nextBtn.removeEventListener("click", onNext),
    () => slideSelect.removeEventListener("change", onSelect),
    () => modeBtn.removeEventListener("click", onToggleMode),
  );
  controls.prepend(prevBtn, slideSelect, nextBtn, modeBtn);

  if (hasNotes) {
    const notesBtn = document.createElement("button");
    notesBtn.type = "button";
    notesBtn.className = "anyfile-legacy-office__btn";
    notesBtn.textContent = copy.notes;
    notesBtn.setAttribute("aria-pressed", "true");
    const onToggleNotes = () => {
      showNotes = !showNotes;
      notesBtn.setAttribute("aria-pressed", String(showNotes));
      updateView();
    };
    notesBtn.addEventListener("click", onToggleNotes);
    cleanups.push(() => notesBtn.removeEventListener("click", onToggleNotes));
    controls.append(notesBtn);
  }

  updateView();
}
