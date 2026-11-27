// @vitest-environment node
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { normalizeMaxBytes, trimInspectPayload, trimReadResult } from "./budget";
import { parseFlags } from "./cli-main";
import { DiskBinarySource } from "./disk-io";
import { createDiskWorkspaceReader, isWithinAllowedRoots, resolveAllowedFile } from "./security";

describe("@anyfile/agent core guards", () => {
  let rootDir = "";
  let outsideDir = "";

  beforeAll(async () => {
    rootDir = await mkdtemp(join(tmpdir(), "anyfile-sec-root-"));
    outsideDir = await mkdtemp(join(tmpdir(), "anyfile-sec-out-"));
    await writeFile(join(rootDir, "ok.txt"), "hello world", "utf8");
    await writeFile(join(outsideDir, "secret.txt"), "top secret", "utf8");
    await symlink(join(outsideDir, "secret.txt"), join(rootDir, "escape.txt"));
  });

  afterAll(async () => {
    if (rootDir) await rm(rootDir, { recursive: true, force: true });
    if (outsideDir) await rm(outsideDir, { recursive: true, force: true });
  });

  it("handles root '/' in allowedRoots and blocks symlink escapes", async () => {
    expect(await isWithinAllowedRoots("/etc/hosts", ["/"])).toBe(true);
    await expect(resolveAllowedFile(join(rootDir, "escape.txt"), [rootDir])).rejects.toMatchObject({
      code: "access-denied",
    });

    const workspace = createDiskWorkspaceReader(rootDir);
    expect(await workspace.open("escape.txt")).toBeNull();
    // Listing a regular file path returns empty cleanly instead of throwing ENOTDIR.
    const listed: unknown[] = [];
    for await (const entry of workspace.list("ok.txt")) {
      listed.push(entry);
    }
    expect(listed).toEqual([]);
  });

  it("rejects post-close reads on DiskBinarySource instead of re-opening fd", async () => {
    const filePath = join(rootDir, "ok.txt");
    const source = new DiskBinarySource(filePath, 11);
    const first = await source.read(0, 5);
    expect(Buffer.from(first).toString("utf8")).toBe("hello");
    source.close();

    expect(() => source.readSync(0, new Uint8Array(5))).toThrow(/closed/i);
    await expect(source.read(0, 0)).rejects.toThrow(/closed/i);
  });

  it("enforces byte and line caps in budget helpers and caps oversized inspect metadata", () => {
    expect(normalizeMaxBytes(0.5)).toBe(1);
    expect(normalizeMaxBytes(-10)).toBe(48 * 1024);
    expect(normalizeMaxBytes(1024 * 1024)).toBe(256 * 1024);

    const manyLines = Array.from({ length: 100 }, (_, i) => `line-${i}`).join("\n");
    const lineCapped = trimReadResult(
      { content: manyLines, contentType: "text", truncated: false, nextCursor: "line:100" },
      48 * 1024,
      10,
    );
    expect(lineCapped.truncated).toBe(true);
    expect(lineCapped.content.split("\n")).toHaveLength(10);
    expect(lineCapped.nextCursor).toBeUndefined();

    const hugeMetadata = {
      blob: "x".repeat(20_000),
      extra: "y".repeat(20_000),
    };
    const trimmed = trimInspectPayload({ metadata: hugeMetadata, targets: [] }, 1024);
    expect(Buffer.byteLength(JSON.stringify(trimmed), "utf8")).toBeLessThanOrEqual(1024);
    expect(trimmed.targets).toEqual([]);
    expect(trimmed.targetsTruncated).toBeUndefined();
    expect(trimmed.metadata.metadataTruncated).toBe(true);
  });

  it("parses --sql values starting with --, supports -- end-of-options, and rejects missing flag values", () => {
    const parsed = parseFlags(["db.sqlite", "--sql", "-- comment\nSELECT 1", "--", "--weird-file.sqlite"]);
    expect(parsed.positionals).toEqual(["db.sqlite", "--weird-file.sqlite"]);
    expect(parsed.flags.get("sql")).toEqual(["-- comment\nSELECT 1"]);

    expect(() => parseFlags(["file.plist", "--out"])).toThrow(/Missing value for option: --out/);
    expect(resolve(rootDir)).toBeTruthy();
  });
});
