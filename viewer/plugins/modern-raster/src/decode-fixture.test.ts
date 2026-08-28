import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import init, { JxlImage } from "jxl-oxide-wasm";

describe("JPEG XL decoder fixture", () => {
  it("decodes the generated looping animation with real WASM", async () => {
    const moduleDirectory = dirname(fileURLToPath(import.meta.resolve("jxl-oxide-wasm")));
    await init({ module_or_path: await readFile(join(moduleDirectory, "jxl_oxide_wasm_bg.wasm")) });
    const bytes = await readFile(join(process.cwd(), "examples", "animated.jxl"));
    const image = new JxlImage();
    try {
      image.forceSrgb = true;
      image.feedBytes(bytes);
      image.tryInit();
      expect(image.loaded).toBe(true);
      expect([image.width, image.height, image.numLoadedKeyframes, image.animated]).toEqual([96, 64, 2, true]);
      const first = image.render(0);
      expect(first.durationNumerator / first.durationDenominator).toBeGreaterThan(0);
      expect(first.encodeToPng().byteLength).toBeGreaterThan(0);
    } finally {
      image.free();
    }
  });
});
