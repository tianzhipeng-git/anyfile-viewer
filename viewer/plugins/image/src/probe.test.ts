import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDeferredFile } from "@anyfile/viewer-test";

import { probeBrowserImage } from "./probe";

function fixture(name: string) {
  const bytes = new Uint8Array(readFileSync(join(process.cwd(), "examples", name)));
  return new File([bytes], name);
}

beforeEach(() => {
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:image-probe");
});

describe("browser image probe", () => {
  it.each(["sample.jpg", "sample.png", "animated.apng", "animated.gif", "animated.webp", "sample.avif"])(
    "returns level 4 from the bounded header of %s",
    async (fileName) => {
      await expect(probeBrowserImage({ file: fixture(fileName), signal: new AbortController().signal }))
        .resolves.toBe(4);
      expect(URL.createObjectURL).not.toHaveBeenCalled();
    },
  );

  it("returns level 0 for a mismatched file without decoding it", async () => {
    await expect(probeBrowserImage({
      file: new File(["plain text"], "fake.png"),
      signal: new AbortController().signal,
    })).resolves.toBe(0);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("cancels an unfinished bounded header read", async () => {
    const deferred = createDeferredFile("delayed.png", 1_024);
    const abortController = new AbortController();
    const probing = probeBrowserImage({ file: deferred.file, signal: abortController.signal });

    abortController.abort();

    await expect(probing).rejects.toMatchObject({ name: "AbortError" });
    expect(deferred.wasCancelled()).toBe(true);
  });
});
