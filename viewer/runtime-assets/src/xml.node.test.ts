// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseXmlDocument } from "./xml.node";

describe("Node XML parser parity with the browser DOMParser", () => {
  it("runs without a global DOMParser", () => {
    expect(typeof globalThis.DOMParser).toBe("undefined");
  });

  it("resolves prefixed and default namespaces", () => {
    const ofd = parseXmlDocument(`<ofd:OFD xmlns:ofd="http://www.ofdspec.org/2016"><ofd:DocBody/></ofd:OFD>`);
    expect(ofd.documentElement.localName).toBe("OFD");
    expect(ofd.documentElement.namespaceURI).toBe("http://www.ofdspec.org/2016");
    expect(ofd.documentElement.children[0]?.localName).toBe("DocBody");

    const fb2 = parseXmlDocument(`<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0"><body/></FictionBook>`);
    expect(fb2.documentElement.namespaceURI).toBe("http://www.gribuser.ru/xml/fictionbook/2.0");
    expect(fb2.querySelectorAll("*")).toHaveLength(2);

    const svg = parseXmlDocument(`<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>`, "image/svg+xml");
    expect(svg.documentElement.namespaceURI).toBe("http://www.w3.org/2000/svg");
  });

  it("reports malformed XML as a parsererror document", () => {
    expect(parseXmlDocument("<a><b></a>").querySelector("parsererror")).not.toBeNull();
  });
});
