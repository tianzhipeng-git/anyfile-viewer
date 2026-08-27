import { zipSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { createViewerTestContext } from "@anyfile/viewer-test";

import { wordViewer } from "./index";

const wordNamespace = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

function documentBytes() {
  const files = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`),
    "word/document.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${wordNamespace}"><w:body><w:p><w:r><w:t>真实 DOCX 渲染</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr></w:body></w:document>`),
  };
  const zipped = zipSync(files);
  return zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer;
}

describe("Word viewer rendering smoke test", () => {
  it("keeps a real docx-preview result attached to the viewer", async () => {
    const context = createViewerTestContext(new File([documentBytes()], "smoke.docx"));

    try {
      const controller = await wordViewer.open(context.context);
      expect(context.container.textContent).toContain("真实 DOCX 渲染");
      expect(context.container.querySelector(".anyfile-docx-wrapper")?.isConnected).toBe(true);
      await controller.dispose();
    } finally {
      context.cleanup();
    }
  });
});
