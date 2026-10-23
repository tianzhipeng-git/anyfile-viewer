import { act, createElement } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { SamplePreviewLink } from "./sample-preview-link";
import { getFormatSample } from "../content/format-samples";
import { crossesIsolationBoundary } from "../lib/isolation-navigation";
import { publicFileUrl } from "../lib/public-file";

let container: HTMLDivElement;
let root: Root | undefined;
const originalLocation = window.location.href;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.anyfile.top");
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  container.remove();
  window.location.href = originalLocation;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it.each([
  ["http://localhost:3000", "skp"],
  ["https://anyfile-preview.vercel.app", "psb"],
])("uses the actual origin %s for %s before any click, even with a production canonical", async (origin, extension) => {
  window.location.href = new URL(`/zh-CN/formats/${extension}`, origin).href;
  const sample = getFormatSample(extension, "zh-CN")!;
  const component = createElement(SamplePreviewLink, {
    locale: "zh-CN", extension, samplePath: sample.download, target: "_blank",
  }, sample.name);
  container.innerHTML = renderToString(component);
  expect(container.innerHTML).not.toContain("www.anyfile.top");
  await act(async () => { root = hydrateRoot(container, component); });
  const link = container.querySelector("a")!;
  const preview = new URL(link.href);
  const source = new URLSearchParams(preview.hash.slice(1)).get("file")!;
  expect(preview.origin).toBe(origin);
  expect(preview.pathname).toBe("/zh-CN/view");
  expect(preview.searchParams.get("entry")).toBe(`/zh-CN/formats/${extension}`);
  expect(preview.searchParams.has("file")).toBe(false);
  expect(publicFileUrl(source, origin).href).toBe(`${origin}${sample.download}`);
  expect(link.target).toBe("_blank");
  expect(crossesIsolationBoundary(window.location.pathname, link.getAttribute("href")!)).toBe(true);
});
