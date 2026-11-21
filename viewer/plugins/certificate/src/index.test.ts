import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createViewerTestContext } from "@anyfile/viewer-test";

import { certificateViewer } from "./index";

const examples = join(process.cwd(), "examples");
const sample = (name: string) => new File([readFileSync(join(examples, name))], name);

describe("X.509 certificate viewer", () => {
  it("opens a PEM chain and switches between certificates", async () => {
    const test = createViewerTestContext(sample("sample-chain.pem"));
    const controller = await certificateViewer.open(test.context);
    const tabs = test.container.querySelectorAll<HTMLButtonElement>(".anyfile-certificate-viewer__tab");
    expect(tabs).toHaveLength(2);
    expect(tabs[0]!.getAttribute("aria-pressed")).toBe("true");
    expect(tabs[1]!.getAttribute("aria-pressed")).toBe("false");
    expect(test.container.textContent).toContain("www.example.anyfile.invalid");
    expect(test.container.textContent).toContain("TLS server authentication");
    expect(test.container.textContent).toContain("http://ocsp.example.anyfile.invalid");

    tabs[1]!.dispatchEvent(new Event("click"));
    expect(tabs[1]!.getAttribute("aria-pressed")).toBe("true");
    expect(test.container.textContent).toContain("Anyfile Sample Root CA");
    expect(test.container.textContent).toContain("CA 证书");

    controller.dispose();
    expect(test.container.childElementCount).toBe(0);
    expect(test.outside.dataset.viewerTestOutside).toBe("untouched");
    controller.dispose();
    test.cleanup();
  });

  it("opens DER input with a single certificate and no tab strip", async () => {
    const test = createViewerTestContext(sample("sample-leaf.der"));
    const controller = await certificateViewer.open(test.context);
    expect(test.container.querySelector<HTMLElement>(".anyfile-certificate-viewer__tabs")!.hidden).toBe(true);
    expect(test.container.textContent).toContain("SHA-256 with RSA");
    expect(test.container.textContent).toContain("203.0.113.7");
    controller.dispose();
    test.cleanup();
  });

  it("rejects files without a certificate", async () => {
    for (const name of ["disguised-private-key.pem", "corrupt-cert.crt"]) {
      const test = createViewerTestContext(sample(name));
      await expect(certificateViewer.open(test.context)).rejects.toMatchObject({ code: "invalid-file" });
      expect(test.container.childElementCount).toBe(0);
      test.cleanup();
    }
  });

  it("enforces the input limit before reading", async () => {
    const file = sample("sample-chain.pem");
    Object.defineProperty(file, "size", { value: 9 * 1024 * 1024 });
    const test = createViewerTestContext(file);
    await expect(certificateViewer.open(test.context)).rejects.toMatchObject({ code: "resource-limit" });
    expect(test.container.childElementCount).toBe(0);
    test.cleanup();
  });

  it("cancels while opening and while active", async () => {
    const opening = createViewerTestContext(sample("sample-chain.pem"));
    opening.abortController.abort();
    await expect(certificateViewer.open(opening.context)).rejects.toMatchObject({ name: "AbortError" });
    expect(opening.container.childElementCount).toBe(0);
    opening.cleanup();

    const active = createViewerTestContext(sample("sample-chain.pem"));
    const controller = await certificateViewer.open(active.context);
    expect(active.container.childElementCount).toBe(1);
    active.abortController.abort();
    expect(active.container.childElementCount).toBe(0);
    await controller.dispose();
    expect(active.container.childElementCount).toBe(0);
    active.cleanup();
  });
});
