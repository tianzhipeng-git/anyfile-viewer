// @vitest-environment node
import { execFile, spawn } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const AGENT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(AGENT_ROOT, "../..");
const CLI_ENTRY = resolve(AGENT_ROOT, "src/cli.ts");

const PLIST_SAMPLE = resolve(REPO_ROOT, "viewer/plugins/plist/examples/app-config.binary.plist");
const SQLITE_SAMPLE = resolve(REPO_ROOT, "viewer/plugins/sqlite/examples/sample.sqlite");
const PST_SAMPLE = resolve(REPO_ROOT, "viewer/plugins/pst/examples/dist-list.pst");

async function runCli(args: readonly string[], env?: NodeJS.ProcessEnv) {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [CLI_ENTRY, ...args], {
      cwd: REPO_ROOT,
      env: { ...process.env, ...env },
      timeout: 20_000,
    });
    return { exitCode: 0, stdout, stderr };
  } catch (error) {
    const err = error as { code?: number; stdout?: string; stderr?: string };
    return {
      exitCode: typeof err.code === "number" ? err.code : 1,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
    };
  }
}

// Each case spawns several CLI processes and workers; the default 5 s is too tight under `pnpm check`.
describe("@anyfile/agent CLI & MCP end-to-end", { timeout: 60_000 }, () => {
  let tempDir = "";

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "anyfile-agent-e2e-"));
  });

  afterAll(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  it("inspects and reads binary plist, sqlite, and pst via CLI subprocess", async () => {
    const inspectPlist = await runCli(["inspect", PLIST_SAMPLE]);
    expect(inspectPlist.exitCode).toBe(0);
    const plistInfo = JSON.parse(inspectPlist.stdout);
    expect(plistInfo.pluginId).toBe("apple-plist");
    expect(plistInfo.matchedBy).toBe("extension");
    expect(plistInfo.capabilities).toContain("read");

    const readPlist = await runCli(["read", PLIST_SAMPLE]);
    expect(readPlist.exitCode).toBe(0);
    expect(readPlist.stdout.length).toBeGreaterThan(0);

    const inspectSqlite = await runCli(["inspect", SQLITE_SAMPLE]);
    expect(inspectSqlite.exitCode).toBe(0);
    const sqliteInfo = JSON.parse(inspectSqlite.stdout);
    expect(sqliteInfo.pluginId).toBe("sqlite-database");
    expect(sqliteInfo.capabilities).toContain("query");

    const querySqlite = await runCli(["query", SQLITE_SAMPLE, "--sql", "SELECT name FROM users ORDER BY id"]);
    expect(querySqlite.exitCode).toBe(0);
    expect(querySqlite.stdout).toContain("Alice");

    const writeSqlite = await runCli(["query", SQLITE_SAMPLE, "--sql", "DROP TABLE users"]);
    expect(writeSqlite.exitCode).not.toBe(0);
    expect(writeSqlite.stderr || writeSqlite.stdout).toMatch(/unsupported-capability|access-denied/);

    const inspectPst = await runCli(["inspect", PST_SAMPLE]);
    expect(inspectPst.exitCode).toBe(0);
    const pstInfo = JSON.parse(inspectPst.stdout);
    expect(pstInfo.pluginId).toBe("outlook-pst");
    expect(pstInfo.targets.length).toBeGreaterThan(0);
  });

  it("falls back to magic bytes when file has no extension and writes --out file", async () => {
    const noExtPath = join(tempDir, "mystery-blob");
    await copyFile(SQLITE_SAMPLE, noExtPath);

    const inspected = await runCli(["inspect", noExtPath]);
    expect(inspected.exitCode).toBe(0);
    const info = JSON.parse(inspected.stdout);
    expect(info.pluginId).toBe("sqlite-database");
    expect(info.matchedBy).toBe("magic");

    const outPath = join(tempDir, "query-out.md");
    const queried = await runCli(["query", noExtPath, "--sql", "SELECT name FROM users ORDER BY id", "--out", outPath]);
    expect(queried.exitCode).toBe(0);
    const written = await readFile(outPath, "utf8");
    expect(written).toContain("Alice");
  });

  it("serves inspect_file, read_file, query_file over MCP stdio and enforces --allow-dir", async () => {
    const allowedDir = resolve(REPO_ROOT, "viewer/plugins/sqlite/examples");
    const child = spawn(process.execPath, [CLI_ENTRY, "mcp", "--allow-dir", allowedDir], {
      cwd: tempDir,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const responses = new Map<number, (msg: Record<string, unknown>) => void>();
    let buffer = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      buffer += chunk;
      let newlineIdx = buffer.indexOf("\n");
      while (newlineIdx !== -1) {
        const line = buffer.slice(0, newlineIdx).trim();
        buffer = buffer.slice(newlineIdx + 1);
        if (line) {
          const parsed = JSON.parse(line) as Record<string, unknown>;
          const id = typeof parsed.id === "number" ? parsed.id : undefined;
          if (id !== undefined && responses.has(id)) {
            const resolveFn = responses.get(id)!;
            responses.delete(id);
            resolveFn(parsed);
          }
        }
        newlineIdx = buffer.indexOf("\n");
      }
    });

    let nextId = 1;
    const rpc = (method: string, params?: Record<string, unknown>) => {
      const id = nextId++;
      return new Promise<Record<string, unknown>>((resolveFn, rejectFn) => {
        const timer = setTimeout(() => rejectFn(new Error(`MCP RPC timeout for ${method}`)), 15_000);
        responses.set(id, (msg) => {
          clearTimeout(timer);
          resolveFn(msg);
        });
        child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
      });
    };

    try {
      const init = await rpc("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test", version: "1.0.0" },
      });
      expect(init.result).toBeTruthy();

      const tools = await rpc("tools/list", {});
      const toolNames = ((tools.result as { tools: { name: string }[] }).tools).map((t) => t.name);
      expect(toolNames).toEqual(["inspect_file", "read_file", "query_file"]);

      const inspected = await rpc("tools/call", {
        name: "inspect_file",
        arguments: { path: SQLITE_SAMPLE },
      });
      const inspectText = ((inspected.result as { content: { text: string }[] }).content[0]).text;
      expect(JSON.parse(inspectText).pluginId).toBe("sqlite-database");

      const queried = await rpc("tools/call", {
        name: "query_file",
        arguments: { path: SQLITE_SAMPLE, sql: "SELECT name FROM users WHERE role = 'admin' ORDER BY id" },
      });
      const queryText = ((queried.result as { content: { text: string }[] }).content[0]).text;
      expect(queryText).toContain("Alice");

      // Path outside allowedDir & cwd must return access-denied.
      const denied = await rpc("tools/call", {
        name: "inspect_file",
        arguments: { path: PLIST_SAMPLE },
      });
      const deniedResult = denied.result as { isError?: boolean; content: { text: string }[] };
      expect(deniedResult.isError).toBe(true);
      expect(deniedResult.content[0].text).toContain("access-denied");
    } finally {
      child.kill();
    }
  });
});
