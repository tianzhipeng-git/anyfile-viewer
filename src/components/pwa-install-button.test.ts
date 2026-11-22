import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import english from "@/i18n/dictionaries/en";
import { PwaInstallButton } from "./pwa-install-button";

let container: HTMLDivElement;
let root: Root;

function stubMatchMedia(standalone: boolean) {
  vi.stubGlobal("matchMedia", vi.fn(() => ({
    matches: standalone,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })));
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  stubMatchMedia(false);
  delete navigator.install;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete navigator.install;
  vi.unstubAllGlobals();
});

describe("PwaInstallButton", () => {
  it("stays hidden when neither Web Install API nor beforeinstallprompt is available", async () => {
    await act(async () => root.render(createElement(PwaInstallButton, { dictionary: english.pwa })));
    expect(container.querySelector("button")).toBeNull();
  });

  it("stays hidden when already running in standalone display mode", async () => {
    stubMatchMedia(true);
    navigator.install = vi.fn(async () => undefined);
    await act(async () => root.render(createElement(PwaInstallButton, { dictionary: english.pwa })));
    expect(container.querySelector("button")).toBeNull();
  });

  it("reveals on beforeinstallprompt, prompts once and hides after completion", async () => {
    await act(async () => root.render(createElement(PwaInstallButton, { dictionary: english.pwa })));
    expect(container.querySelector("button")).toBeNull();

    const prompt = vi.fn(async () => undefined);
    const event = new Event("beforeinstallprompt", { cancelable: true }) as BeforeInstallPromptEvent;
    Object.assign(event, {
      platforms: ["web"],
      prompt,
      userChoice: Promise.resolve({ outcome: "accepted", platform: "web" }),
    });

    await act(async () => {
      window.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    const button = container.querySelector("button");
    expect(button?.textContent).toContain(english.pwa.installApp);

    await act(async () => {
      button!.click();
    });

    expect(prompt).toHaveBeenCalledTimes(1);
    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector('[role="status"]')?.textContent).toBe(english.pwa.installSuccess);
  });

  it("prefers navigator.install(), keeps focusable aria-disabled while installing and allows retry on AbortError", async () => {
    let rejectFirst!: (reason?: unknown) => void;
    const installSpy = vi.fn()
      .mockImplementationOnce(() => new Promise<void>((_resolve, reject) => {
        rejectFirst = reject;
      }))
      .mockResolvedValueOnce(undefined);
    navigator.install = installSpy;

    await act(async () => root.render(createElement(PwaInstallButton, { dictionary: english.pwa })));

    const button = container.querySelector("button")!;
    expect(button).not.toBeNull();

    await act(async () => {
      button.click();
    });
    expect(installSpy).toHaveBeenCalledTimes(1);
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.disabled).toBe(false);

    await act(async () => {
      const abortError = new Error("canceled");
      abortError.name = "AbortError";
      rejectFirst(abortError);
    });
    expect(container.querySelector("button")).not.toBeNull();
    expect(container.querySelector('[role="status"]')?.textContent).toBe(english.pwa.installCanceled);

    await act(async () => {
      container.querySelector("button")!.click();
    });
    expect(installSpy).toHaveBeenCalledTimes(2);
    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector('[role="status"]')?.textContent).toBe(english.pwa.installSuccess);
  });
});
