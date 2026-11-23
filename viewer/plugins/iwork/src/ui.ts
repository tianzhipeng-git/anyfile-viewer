import { createInspectorShell, createNotice, createSection, el, viewerTheme as t, type InspectorShell } from "@anyfile/viewer-ui";

import type { IworkModel, IworkSection } from "./model";

export type IworkCopy = {
  readonly pages: string; readonly keynote: string; readonly modern: string; readonly legacy: string;
  readonly slides: (count: number) => string; readonly paragraphs: (count: number) => string;
  readonly preview: string; readonly body: string; readonly textBoxes: string; readonly slide: (index: number) => string;
  readonly notes: string; readonly emptySlide: string; readonly noText: string; readonly limitation: string;
};

const styles = `
  .anyfile-iwork__page { max-width: 880px; margin: 0 auto; padding: 16px; display: grid; gap: 16px; }
  .anyfile-iwork__preview { display: block; max-width: 100%; max-height: 70vh; margin: 0 auto; border: 1px solid ${t.border}; background: #fff; }
  .anyfile-iwork__text p { margin: 0 0 0.75em; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 14px; line-height: 1.6; }
  .anyfile-iwork__slide { display: grid; grid-template-columns: minmax(0, 260px) minmax(0, 1fr); gap: 16px; align-items: start; padding: 12px; border: 1px solid ${t.border}; border-radius: 8px; background: ${t.surface}; }
  .anyfile-iwork__slide--text-only { grid-template-columns: minmax(0, 1fr); }
  .anyfile-iwork__slide img { width: 100%; height: auto; border: 1px solid ${t.border}; background: #fff; }
  .anyfile-iwork__slide h3 { margin: 0 0 8px; font-size: 13px; color: ${t.muted}; }
  .anyfile-iwork__slide p { margin: 0 0 6px; white-space: pre-wrap; overflow-wrap: anywhere; }
  .anyfile-iwork__slide p:first-of-type { font-weight: 600; }
  .anyfile-iwork__notes { margin-top: 10px; padding-top: 8px; border-top: 1px dashed ${t.border}; color: ${t.muted}; }
  .anyfile-iwork__slide .anyfile-iwork__notes p { font-weight: 400; }
  .anyfile-iwork__empty { color: ${t.muted}; font-style: italic; }
  @container (max-width: 560px) { .anyfile-iwork__slide { grid-template-columns: minmax(0, 1fr); } }
`;

function paragraphs(list: readonly string[]) {
  return list.map((text) => el("p", undefined, text));
}

function textSection(title: string, section: IworkSection) {
  return createSection(title, el("div", "anyfile-iwork__text", ...paragraphs(section.paragraphs)));
}

function slideCard(section: IworkSection, index: number, imageUrl: string | undefined, copy: IworkCopy) {
  const label = copy.slide(index + 1);
  const text = el("div", undefined, el("h3", undefined, label));
  if (section.paragraphs.length) text.append(...paragraphs(section.paragraphs));
  else text.append(el("p", "anyfile-iwork__empty", copy.emptySlide));
  if (section.notes.length) text.append(el("div", "anyfile-iwork__notes", el("strong", undefined, copy.notes), ...paragraphs(section.notes)));
  const card = el("article", imageUrl ? "anyfile-iwork__slide" : "anyfile-iwork__slide anyfile-iwork__slide--text-only");
  card.setAttribute("aria-label", label);
  if (imageUrl) card.append(el("img", { attrs: { src: imageUrl, alt: label, loading: "lazy", decoding: "async" } }));
  card.append(text);
  return card;
}

/** Renders the extracted model; `images` maps package paths to object URLs owned by the caller. */
export function renderIwork(
  fileName: string,
  model: IworkModel,
  previewUrl: string | undefined,
  images: ReadonlyMap<string, string>,
  copy: IworkCopy,
): InspectorShell {
  const isKeynote = model.app === "keynote";
  const paragraphCount = model.sections.reduce((sum, section) => sum + section.paragraphs.length, 0);
  const shell = createInspectorShell({
    className: "anyfile-iwork",
    title: fileName,
    subtitle: isKeynote ? copy.keynote : copy.pages,
    badges: [{ text: model.generation === "iwa" ? copy.modern : copy.legacy, tone: "neutral" }],
    stats: [isKeynote ? copy.slides(model.sections.length) : copy.paragraphs(paragraphCount)],
    extraStyles: styles,
  });
  const page = el("div", "anyfile-iwork__page", createNotice(copy.limitation));
  const hasSlideImages = model.sections.some((section) => section.image && images.has(section.image));
  if (previewUrl && !hasSlideImages) {
    page.append(createSection(copy.preview, el("img", { className: "anyfile-iwork__preview", attrs: { src: previewUrl, alt: copy.preview } })));
  }
  if (isKeynote) {
    model.sections.forEach((section, index) => {
      page.append(slideCard(section, index, section.image ? images.get(section.image) : undefined, copy));
    });
  } else {
    for (const section of model.sections) page.append(textSection(section.role === "body" ? copy.body : copy.textBoxes, section));
  }
  if (!model.sections.length) page.append(el("p", "anyfile-iwork__empty", copy.noText));
  shell.viewport.append(page);
  return shell;
}
