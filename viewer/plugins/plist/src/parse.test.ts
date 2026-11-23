import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { decodeBinaryPlist } from "./binary-plist";
import { decodeXmlPlist } from "./xml-plist";
import type { PlistValue } from "./types";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "../examples");
const binaryBytes = new Uint8Array(readFileSync(join(DIR, "app-config.binary.plist")));
const xmlText = readFileSync(join(DIR, "app-config.xml.plist"), "utf8");

function asDict(value: PlistValue): Record<string, PlistValue> {
  if (value.kind !== "dict") throw new Error("expected dict");
  return Object.fromEntries(value.entries.map((entry) => [entry.key, entry.value]));
}

const expected = {
  CFBundleIdentifier: "com.example.demo",
  CFBundleName: "DemoApp",
  CFBundleVersion: "1.2.3",
  LSMinimumSystemVersion: "13.0",
};

/** Both sample files describe the same document, so assert identical semantics. */
function assertSample(value: PlistValue) {
  const dict = asDict(value);
  for (const [key, text] of Object.entries(expected)) {
    expect(dict[key]).toEqual({ kind: "string", value: text });
  }
  expect(dict.NSHighResolutionCapable).toEqual({ kind: "boolean", value: true });
  expect(dict.SupportedLanguages).toEqual({
    kind: "array",
    items: [{ kind: "string", value: "en" }, { kind: "string", value: "zh-Hans" }],
  });
  expect(dict.MaxItems).toEqual({ kind: "integer", value: BigInt(42) });
  expect(dict.Ratio).toEqual({ kind: "real", value: 0.75 });
  if (dict.LaunchDate.kind !== "date") throw new Error("expected date");
  expect(dict.LaunchDate.value.toISOString()).toBe("2024-06-01T12:30:00.000Z");
  if (dict.Payload.kind !== "data") throw new Error("expected data");
  expect(new TextDecoder().decode(dict.Payload.value)).toBe("Hello, world!");
}

describe("binary plist decoder", () => {
  it("decodes a real binary plist produced by plutil", () => {
    assertSample(decodeBinaryPlist(binaryBytes));
  });

  it("rejects input without the bplist00 magic", () => {
    expect(() => decodeBinaryPlist(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toThrow();
  });

  it("rejects a truncated binary plist", () => {
    expect(() => decodeBinaryPlist(binaryBytes.subarray(0, binaryBytes.length - 24))).toThrow();
  });
});

describe("xml plist decoder", () => {
  it("decodes a real XML plist with matching semantics", () => {
    assertSample(decodeXmlPlist(xmlText));
  });

  it("decodes entities and nested structures", () => {
    const value = decodeXmlPlist(`<plist><dict>
      <key>a &amp; b</key><string>&lt;tag&gt;</string>
      <key>nested</key><dict><key>k</key><integer>-7</integer></dict>
      <key>empty</key><string></string>
    </dict></plist>`);
    const dict = asDict(value);
    expect(dict["a & b"]).toEqual({ kind: "string", value: "<tag>" });
    expect(dict.nested).toEqual({ kind: "dict", entries: [{ key: "k", value: { kind: "integer", value: BigInt(-7) } }] });
    expect(dict.empty).toEqual({ kind: "string", value: "" });
  });

  it("rejects malformed input", () => {
    expect(() => decodeXmlPlist("not xml at all")).toThrow();
    expect(() => decodeXmlPlist("<plist><dict><key>a</key></dict></plist>")).toThrow();
    expect(() => decodeXmlPlist("<plist><integer>abc</integer></plist>")).toThrow();
  });
});
