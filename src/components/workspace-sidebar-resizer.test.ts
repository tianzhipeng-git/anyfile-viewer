import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkspaceSidebarResizer } from "./workspace-sidebar-resizer";

let container: HTMLDivElement;
let handle: HTMLElement;
let root: Root;
const commit = vi.fn();

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  commit.mockClear();
  container = document.createElement("div");
  Object.defineProperty(container, "clientWidth", { value: 900 });
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(WorkspaceSidebarResizer, {
    width: 300, onWidthChange: commit, locale: "zh-CN",
  })));
  handle = container.querySelector('[role="separator"]')!;
  handle.setPointerCapture = vi.fn();
  handle.releasePointerCapture = vi.fn();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function pointer(type: string, clientX: number) {
  await act(async () => handle.dispatchEvent(new PointerEvent(type, {
    bubbles: true, pointerId: 1, isPrimary: true, button: 0, clientX,
  })));
}

it("previews without committing, then applies only the release position within available space", async () => {
  await pointer("pointerdown", 300);
  await pointer("pointermove", 450);
  expect(commit).not.toHaveBeenCalled();
  expect(handle.getAttribute("aria-valuenow")).toBe("450");
  await pointer("pointerup", 800);
  expect(commit).toHaveBeenCalledExactlyOnceWith(540);
  expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
});

it("discards a preview when Escape or pointer cancellation interrupts the drag", async () => {
  await pointer("pointerdown", 300);
  await pointer("pointermove", 450);
  await act(async () => handle.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" })));
  await pointer("pointerup", 450);
  expect(commit).not.toHaveBeenCalled();
  await pointer("pointerdown", 300);
  await pointer("pointercancel", 450);
  await pointer("pointerup", 450);
  expect(commit).not.toHaveBeenCalled();
  expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
});

it("supports keyboard adjustment and respects both width limits", async () => {
  for (const [key, width] of [["ArrowRight", 310], ["Home", 240], ["End", 540]] as const) {
    await act(async () => handle.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key })));
    expect(commit).toHaveBeenLastCalledWith(width);
  }
  await pointer("pointerdown", 300);
  await pointer("pointerup", 0);
  expect(commit).toHaveBeenLastCalledWith(240);
});
