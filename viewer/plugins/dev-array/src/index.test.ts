import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";
import { validateManifest } from "@anyfile/viewer-protocol";
import { createTrackedFile, createViewerTestContext, truncated, type ViewerTestContext } from "@anyfile/viewer-test";

import { devArrayViewer } from "./index";
import { devArrayManifest } from "./manifest";
import { int32Data, npyFixture, npzFixture } from "./test-fixtures";

const contexts: ViewerTestContext[] = [];

function context(bytes: Uint8Array, name: string) {
  const value = createViewerTestContext(new File([bytes.slice().buffer as ArrayBuffer], name));
  contexts.push(value);
  return value;
}

afterEach(() => {
  for (const value of contexts.splice(0)) value.cleanup();
});

describe("dev array viewer", () => {
  it("publishes a valid NPY and NPZ manifest", () => {
    expect(() => validateManifest(devArrayManifest)).not.toThrow();
    expect(devArrayManifest.formats.flatMap((format) => format.extensions)).toEqual([".npy", ".npz"]);
  });

  it("pages numeric NPY data with bounded range reads", async () => {
    const values = Array.from({ length: 205 }, (_, index) => index - 10);
    const bytes = npyFixture({ descr: "'<i4'", shape: [5, 41], data: int32Data(values) });
    const tracked = createTrackedFile(bytes, "large.npy");
    const test = createViewerTestContext(tracked.file);
    contexts.push(test);
    const wholeRead = vi.spyOn(tracked.file, "arrayBuffer");
    const controller = await devArrayViewer.open(test.context);

    expect(test.container.textContent).toContain("(5, 41)");
    expect(test.container.querySelectorAll("tbody tr")).toHaveLength(100);
    expect(test.container.textContent).toContain("1–100 / 205");
    expect(wholeRead).not.toHaveBeenCalled();
    expect(Math.max(...tracked.reads.map((read) => read.end - read.start))).toBeLessThanOrEqual(400);

    const next = [...test.container.querySelectorAll("button")].find((button) => button.textContent === "下一页")!;
    next.click();
    await vi.waitFor(() => expect(test.container.textContent).toContain("101–200 / 205"));
    expect(test.container.textContent).toContain("(2, 18)");
    await controller.dispose();
    await controller.dispose();
    expect(test.container.childElementCount).toBe(0);
  });

  it("decodes booleans, fixed strings, big-endian values, Fortran coordinates, and structures", async () => {
    const structured = new Uint8Array(14);
    const view = new DataView(structured.buffer);
    view.setInt32(0, 42, false);
    structured.set(new TextEncoder().encode("yes"), 4);
    view.setInt32(7, -7, false);
    structured.set(new TextEncoder().encode("no"), 11);
    const bytes = npyFixture({
      descr: "[('id', '>i4'), ('tag', '|S3')]",
      shape: [2, 1],
      fortran: true,
      data: structured,
    });
    const test = context(bytes, "records.npy");
    const controller = await devArrayViewer.open(test.context);
    expect(test.container.textContent).toContain("Fortran");
    expect(test.container.textContent).toContain("42");
    expect(test.container.textContent).toContain("yes");
    expect(test.container.textContent).toContain("-7");
    await controller.dispose();

    const booleans = context(npyFixture({ descr: "'|b1'", shape: [2], data: Uint8Array.of(0, 1) }), "flags.npy");
    const booleanController = await devArrayViewer.open(booleans.context);
    expect(booleans.container.textContent).toContain("false");
    expect(booleans.container.textContent).toContain("true");
    await booleanController.dispose();

    const unicodeData = new Uint8Array(8);
    const unicodeView = new DataView(unicodeData.buffer);
    unicodeView.setUint32(0, "数".codePointAt(0)!, true);
    unicodeView.setUint32(4, "组".codePointAt(0)!, true);
    const unicode = context(npyFixture({ descr: "'<U2'", shape: [1], data: unicodeData }), "text.npy");
    const unicodeController = await devArrayViewer.open(unicode.context);
    expect([...unicode.container.querySelectorAll("td")].some((cell) => cell.textContent === "数组")).toBe(true);
    await unicodeController.dispose();
  });

  it("lists NPZ arrays and reuses the NPY rendering path for selected compressed entries", async () => {
    const first = npyFixture({ descr: "'<i4'", shape: [2], data: int32Data([11, 12]) });
    const second = npyFixture({ descr: "'<i4'", shape: [1], data: int32Data([99]) });
    const test = context(npzFixture({ "first.npy": first, "nested/second.npy": second }), "arrays.npz");
    const controller = await devArrayViewer.open(test.context);
    expect(test.container.textContent).toContain("first.npy");
    expect(test.container.textContent).toContain("11");

    const select = test.container.querySelector("select")!;
    select.value = "1";
    select.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(test.container.textContent).toContain("99"));
    expect(test.container.textContent).toContain("nested/second.npy");
    await controller.dispose();
  });

  it("rejects an NPZ entry with an unsafe declared compression ratio", async () => {
    const array = npyFixture({ descr: "'|u1'", shape: [2 * 1024 * 1024], data: new Uint8Array(2 * 1024 * 1024) });
    const bytes = npzFixture({ "bomb.npy": array });
    const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let offset = 0; offset + 46 <= bytes.length; offset += 1) {
      if (data.getUint32(offset, true) === 0x02014b50) {
        data.setUint32(offset + 20, 1, true);
        break;
      }
    }
    const test = context(bytes, "bomb.npz");
    await expect(devArrayViewer.open(test.context)).rejects.toMatchObject({ code: "resource-limit" });
    expect(test.container.childElementCount).toBe(0);
  });

  it("does not deserialize object dtype payloads", async () => {
    const payload = new TextEncoder().encode("c__builtin__\neval\n(S'danger'\ntR.");
    const test = context(npyFixture({ descr: "'|O8'", shape: [1], data: payload }), "objects.npy");
    const controller = await devArrayViewer.open(test.context);
    expect(test.container.textContent).toContain("对象 dtype");
    expect(test.container.textContent).toContain("未反序列化");
    expect(test.container.querySelector("tbody")).toBeNull();
    await controller.dispose();
  });

  it("rejects damaged, truncated, and over-limit headers without leaving DOM", async () => {
    const valid = npyFixture({ descr: "'<i4'", shape: [2], data: int32Data([1, 2]) });
    const fake = context(new TextEncoder().encode("not numpy"), "fake.npy");
    await expect(devArrayViewer.open(fake.context)).rejects.toMatchObject({ code: "invalid-file" });
    const short = context(truncated(valid, valid.length - 2), "short.npy");
    await expect(devArrayViewer.open(short.context)).rejects.toMatchObject({ code: "invalid-file" });
    const oversized = npyFixture({ descr: "'<i4'", shape: [1], data: int32Data([1]), version: 2 });
    new DataView(oversized.buffer).setUint32(8, 1024 * 1024 + 1, true);
    const huge = context(oversized, "huge-header.npy");
    await expect(devArrayViewer.open(huge.context)).rejects.toMatchObject({ code: "resource-limit" });
    expect(fake.container.childElementCount).toBe(0);
  });

  it("rejects damaged, truncated, and over-limit NPZ directories", async () => {
    const array = npyFixture({ descr: "'<i4'", shape: [1], data: int32Data([1]) });
    const valid = npzFixture({ "value.npy": array });
    const truncatedArchive = context(valid.slice(0, -5), "truncated.npz");
    await expect(devArrayViewer.open(truncatedArchive.context)).rejects.toMatchObject({ code: "invalid-file" });

    const damaged = valid.slice();
    const data = new DataView(damaged.buffer);
    for (let offset = 0; offset + 4 <= damaged.length; offset += 1) {
      if (data.getUint32(offset, true) === 0x02014b50) {
        data.setUint32(offset, 0, true);
        break;
      }
    }
    await expect(devArrayViewer.open(context(damaged, "damaged.npz").context))
      .rejects.toMatchObject({ code: "invalid-file" });

    const tooMany = valid.slice();
    const eocd = tooMany.length - 22;
    new DataView(tooMany.buffer).setUint16(eocd + 10, 10_001, true);
    await expect(devArrayViewer.open(context(tooMany, "too-many.npz").context))
      .rejects.toMatchObject({ code: "resource-limit" });

    const hugeDirectory = valid.slice();
    new DataView(hugeDirectory.buffer).setUint32(eocd + 12, 33 * 1024 * 1024, true);
    await expect(devArrayViewer.open(context(hugeDirectory, "huge-directory.npz").context))
      .rejects.toMatchObject({ code: "resource-limit" });
  });

  it("cleans active content on host cancellation", async () => {
    const test = context(npyFixture({ descr: "'<i4'", shape: [1], data: int32Data([1]) }), "value.npy");
    const controller = await devArrayViewer.open(test.context);
    test.abortController.abort();
    expect(test.container.childElementCount).toBe(0);
    await controller.dispose();
  });

  it.each([
    ["matrix.npy", "(3, 4)"],
    ["objects.npy", "未反序列化"],
    ["arrays.npz", "matrix.npy"],
  ])("opens the committed fixture %s", async (name, expected) => {
    const bytes = readFileSync(join(process.cwd(), "examples", name));
    const test = context(Uint8Array.from(bytes), name);
    const controller = await devArrayViewer.open(test.context);
    expect(test.container.textContent).toContain(expected);
    await controller.dispose();
  });
});
