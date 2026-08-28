import { describe, expect, it, vi } from "vitest";
import { createDeferredFile } from "@anyfile/viewer-test";

import { probeSQLite } from "./probe";

describe("SQLite probe", () => {
  it("recognizes the 16-byte SQLite header through a sliced read", async () => {
    const file = new File(["SQLite format 3\0payload"], "database.db");
    const directRead = vi.spyOn(file, "arrayBuffer");

    await expect(probeSQLite({ file, signal: new AbortController().signal })).resolves.toBe(5);
    expect(directRead).not.toHaveBeenCalled();
    await expect(probeSQLite({
      file: new File(["not sqlite"], "database.db"),
      signal: new AbortController().signal,
    })).resolves.toBe(0);
  });

  it("cancels an unfinished header read", async () => {
    const deferred = createDeferredFile("database.db", 16);
    const abortController = new AbortController();
    const probing = probeSQLite({ file: deferred.file, signal: abortController.signal });

    abortController.abort();

    await expect(probing).rejects.toMatchObject({ name: "AbortError" });
    expect(deferred.wasCancelled()).toBe(true);
  });
});
