import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FileWorkspace } from "./file-workspace";
import english from "../i18n/dictionaries/en";
import chinese from "../i18n/dictionaries/zh-CN";

vi.mock("next/navigation", () => ({
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.history.replaceState(null, "", "/en/view");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it("opens the existing multiple-file input from the central task call to action", async () => {
  window.history.replaceState(null, "", "/en/view?entry=%2Fen%2Fformats%2Fpsb");
  await act(async () => root.render(createElement(FileWorkspace, { locale: "en", dictionary: english })));
  expect(container.querySelector("h1")?.textContent).toBe(".PSB viewer");
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  const choose = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === english.workspace.chooseLocalFile)!;
  const click = vi.spyOn(input, "click");
  expect(input.multiple).toBe(true);
  await act(async () => choose.click());
  expect(click).toHaveBeenCalledTimes(1);
  await act(async () => input.dispatchEvent(new Event("cancel")));
  expect(container.querySelector("h1")?.textContent).toBe(".PSB viewer");
});

it("retains the camera task and explains which INSV recordings need a pair", async () => {
  window.history.replaceState(null, "", "/zh-CN/view?entry=%2Fzh-CN%2Fviewers%2Finsta360");
  await act(async () => root.render(createElement(FileWorkspace, { locale: "zh-CN", dictionary: chinese })));
  expect(container.querySelector("h1")?.textContent).toBe("Insta360查看器");
  expect(container.textContent).toContain(chinese.workspace.insvPairHint);
  expect(container.querySelector("h1")?.parentElement?.textContent).toContain(chinese.viewer.selectDescription);
});

it("keeps arbitrary entry values out of the welcome", async () => {
  window.history.replaceState(null, "", "/en/view?entry=%2Fen%2Fformats%2Fprivate-filename");
  await act(async () => root.render(createElement(FileWorkspace, { locale: "en", dictionary: english })));
  expect(container.querySelector("h1")?.textContent).toBe(english.viewer.selectTitle);
  expect(container.textContent).not.toContain("private-filename");
  expect(container.textContent).not.toContain(english.workspace.insvPairHint);
});

it("keeps local file selection out of compact embeds", async () => {
  window.history.replaceState(null, "", "/en/embed");
  await act(async () => root.render(createElement(FileWorkspace, { locale: "en", dictionary: english, embedded: true })));
  expect(container.querySelector('input[type="file"]')).toBeNull();
  expect(Array.from(container.querySelectorAll("button")).some((button) => button.textContent === english.workspace.chooseLocalFile)).toBe(false);
});
