// @vitest-environment node
import { describe, expect, it } from "vitest";
import { discoverBrowserExecutable } from "./browser-discovery";

describe("browser discovery", () => {
  it("uses ANYFILE_BROWSER_PATH when it points to an existing executable", () => {
    const found = discoverBrowserExecutable({
      envPath: process.execPath,
      candidates: [],
      searchPathEnv: "",
    });
    expect(found).toBe(process.execPath);
  });

  it("throws runtime-unavailable when ANYFILE_BROWSER_PATH does not exist", () => {
    expect(() =>
      discoverBrowserExecutable({
        envPath: "/nonexistent/path/to/chromium-binary",
        candidates: [],
        searchPathEnv: "",
      }),
    ).toThrow(/ANYFILE_BROWSER_PATH/);
  });

  it("throws runtime-unavailable with clear guidance when no browser is installed", () => {
    let caught: unknown;
    try {
      discoverBrowserExecutable({
        envPath: "",
        candidates: ["/nonexistent/chrome", "/nonexistent/edge"],
        searchPathEnv: "",
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: "runtime-unavailable" });
    expect((caught as Error).message).toContain("ANYFILE_BROWSER_PATH");
  });
});
