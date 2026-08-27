import { zipSync, strToU8 } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";
import { validateManifest } from "@anyfile/viewer-protocol";
import {
  createDeferredFile,
  createViewerTestContext,
  type ViewerTestContext,
} from "@anyfile/viewer-test";

import { excelViewer } from "./index";
import { excelManifest } from "./manifest";

const activeContexts: ViewerTestContext[] = [];
const spreadsheetNamespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const relationshipNamespace = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

function testContext(file: File) {
  const result = createViewerTestContext(file);
  activeContexts.push(result);
  return result;
}

function sheetXml(rows: readonly (readonly string[])[]) {
  const contents = rows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const reference = `${String.fromCharCode(65 + columnIndex)}${rowIndex + 1}`;
      return `<c r="${reference}" t="inlineStr"><is><t>${value}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${spreadsheetNamespace}"><sheetData>${contents}</sheetData></worksheet>`;
}

function workbookBytes() {
  const summaryRows = [
    ["名称", "状态"],
    ...Array.from({ length: 100 }, (_, index) => [`项目 ${index + 1}`, index % 2 ? "完成" : "进行中"]),
  ];
  const files = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="${spreadsheetNamespace}" xmlns:r="${relationshipNamespace}"><sheets><sheet name="汇总" sheetId="1" r:id="rId1"/><sheet name="详情" sheetId="2" r:id="rId2"/></sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>`),
    "xl/worksheets/sheet1.xml": strToU8(sheetXml(summaryRows)),
    "xl/worksheets/sheet2.xml": strToU8(sheetXml([["说明"], ["第二个工作表"]])),
  };
  const zipped = zipSync(files);
  return zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer;
}

function validWorkbook() {
  return new File([workbookBytes()], "workbook.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

afterEach(() => {
  for (const context of activeContexts.splice(0)) context.cleanup();
});

describe("Excel viewer protocol compliance", () => {
  it("publishes a valid v1 manifest", () => {
    expect(() => validateManifest(excelManifest)).not.toThrow();
    const extensions = excelManifest.formats.flatMap((format) => format.extensions);
    expect(extensions).toEqual(expect.arrayContaining([".xlsx", ".xlsm", ".xlsb", ".xls", ".ods", ".numbers"]));
  });

  it("opens a CSV workbook through the same spreadsheet plugin", async () => {
    const context = testContext(new File(["name,score\nAda,98"], "scores.csv", { type: "text/csv" }));
    const controller = await excelViewer.open(context.context);

    expect(context.container.textContent).toContain("Ada");
    expect(context.container.textContent).toContain("98");
    await controller.dispose();
  });

  it("opens a real workbook, paginates, switches sheets, and disposes repeatedly", async () => {
    const file = validWorkbook();
    const directRead = vi.spyOn(file, "arrayBuffer");
    const fetchRequest = vi.spyOn(globalThis, "fetch");
    const context = testContext(file);
    const controller = await excelViewer.open(context.context);

    expect(context.container.textContent).toContain("项目 1");
    expect(context.container.querySelector("[data-meta]")?.textContent).toBe("1–100 / 101 行");
    expect(context.outside.dataset.viewerTestOutside).toBe("untouched");
    expect(context.progress.at(-1)?.stage).toBe("ready");
    expect(directRead).not.toHaveBeenCalled();
    expect(fetchRequest).not.toHaveBeenCalled();

    const nextButton = context.container.querySelector<HTMLButtonElement>("[data-next]")!;
    nextButton.click();
    expect(context.container.querySelector("[data-meta]")?.textContent).toBe("101–101 / 101 行");
    const sheetSelect = context.container.querySelector<HTMLSelectElement>("[data-sheet]")!;
    sheetSelect.value = "1";
    sheetSelect.dispatchEvent(new Event("change"));
    expect(context.container.textContent).toContain("第二个工作表");

    await controller.dispose();
    await controller.dispose();
    nextButton.click();
    expect(context.container.childElementCount).toBe(0);
  });

  it("cleans partial state when parsing an invalid workbook fails", async () => {
    const context = testContext(new File(["PK invalid archive"], "broken.xlsx"));

    await expect(excelViewer.open(context.context)).rejects.toMatchObject({
      code: "invalid-file",
    });
    expect(context.container.childElementCount).toBe(0);
    expect(context.outside.dataset.viewerTestOutside).toBe("untouched");
  });

  it("honors cancellation during opening", async () => {
    const deferred = createDeferredFile("delayed.xlsx", workbookBytes().byteLength);
    const context = testContext(deferred.file);
    const opening = excelViewer.open(context.context);

    context.abortController.abort();

    await expect(opening).rejects.toMatchObject({ name: "AbortError" });
    expect(deferred.wasCancelled()).toBe(true);
    expect(context.container.childElementCount).toBe(0);
  });

  it("uses the requested locale for viewer controls", async () => {
    const context = testContext(validWorkbook());
    const controller = await excelViewer.open({ ...context.context, locale: "en-US" });

    expect(context.container.querySelector("[data-next]")?.textContent).toBe("Next");
    expect(context.container.querySelector("[data-sheet]")?.getAttribute("aria-label")).toBe("Choose worksheet");
    await controller.dispose();
  });

  it("disposes immediately when an active viewer is aborted", async () => {
    const context = testContext(validWorkbook());
    const controller = await excelViewer.open(context.context);

    context.abortController.abort();
    expect(context.container.childElementCount).toBe(0);
    await controller.dispose();
    expect(context.container.childElementCount).toBe(0);
  });

  it("rejects files over the declared resource limit before reading", async () => {
    const slice = vi.fn();
    const file = {
      name: "huge.xlsx",
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      size: 50 * 1024 * 1024 + 1,
      slice,
    } as unknown as File;
    const context = testContext(file);

    await expect(excelViewer.open(context.context)).rejects.toMatchObject({
      code: "resource-limit",
    });
    expect(slice).not.toHaveBeenCalled();
    expect(context.container.childElementCount).toBe(0);
  });
});
