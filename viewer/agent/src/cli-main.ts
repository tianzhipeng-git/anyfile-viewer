import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { AgentError } from "@anyfile/viewer-protocol";
import { AgentService } from "./agent-core";
import { toAgentFileError } from "./budget";
import { clearVendorCache, listVendorCache } from "./cache";
import { runMcpServer } from "./mcp";

function parseFlags(args: readonly string[]): {
  readonly positionals: string[];
  readonly flags: Map<string, string[]>;
} {
  const positionals: string[] = [];
  const flags = new Map<string, string[]>();
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token.startsWith("--")) {
      const eq = token.indexOf("=");
      let key: string;
      let value: string;
      if (eq !== -1) {
        key = token.slice(2, eq);
        value = token.slice(eq + 1);
      } else {
        key = token.slice(2);
        const next = args[i + 1];
        if (next !== undefined && !next.startsWith("--")) {
          value = next;
          i += 1;
        } else {
          value = "true";
        }
      }
      const list = flags.get(key) ?? [];
      list.push(value);
      flags.set(key, list);
    } else {
      positionals.push(token);
    }
  }
  return { positionals, flags };
}

function getFlag(flags: Map<string, string[]>, key: string): string | undefined {
  const values = flags.get(key);
  return values?.[values.length - 1];
}

function printUsage(): void {
  process.stdout.write(
    [
      "Usage: anyfile <command> [options]",
      "",
      "Commands:",
      "  inspect <path>                                        Identify format, capabilities, and targets",
      "  read <path> [--target t] [--cursor c] [--filter kw] [--max-bytes n] [--out file]",
      "  query <path> --sql <sql> [--target t] [--cursor c] [--max-bytes n] [--out file]",
      "  cache <list|clear>                                    Inspect or clear local /vendor/ asset cache",
      "  mcp [--allow-dir <dir>...]                            Start MCP stdio server",
      "",
    ].join("\n"),
  );
}

export async function runCli(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv;
  if (!command || command === "--help" || command === "-h") {
    printUsage();
    return 0;
  }

  const { positionals, flags } = parseFlags(rest);

  if (command === "mcp") {
    const allowDirs = flags.get("allow-dir") ?? [];
    const allowedRoots = [process.cwd(), ...allowDirs];
    await runMcpServer({ allowedRoots });
    return 0;
  }

  if (command === "cache") {
    const sub = positionals[0] ?? "list";
    if (sub === "list") {
      const info = await listVendorCache();
      process.stdout.write(`${JSON.stringify(info, null, 2)}\n`);
      return 0;
    }
    if (sub === "clear") {
      const info = await clearVendorCache();
      process.stdout.write(`${JSON.stringify(info, null, 2)}\n`);
      return 0;
    }
    process.stderr.write(`${JSON.stringify(toAgentFileError(new AgentError("invalid-argument", `Unsupported cache subcommand: ${sub}`)))}\n`);
    return 1;
  }

  const targetPath = positionals[0];
  if (!targetPath) {
    process.stderr.write(`${JSON.stringify(toAgentFileError(new AgentError("invalid-argument", "Missing file path argument.")))}\n`);
    return 1;
  }

  const resolvedParent = dirname(resolve(targetPath));
  const service = new AgentService({
    allowedRoots: [resolvedParent],
    persistent: false,
  });

  try {
    if (command === "inspect") {
      const result = await service.inspectFile(targetPath);
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    if (command === "read") {
      const maxBytesRaw = getFlag(flags, "max-bytes");
      const maxBytes = maxBytesRaw ? Number(maxBytesRaw) : undefined;
      const result = await service.readFile(targetPath, {
        target: getFlag(flags, "target"),
        cursor: getFlag(flags, "cursor"),
        filter: getFlag(flags, "filter"),
        maxBytes,
      });
      const outPath = getFlag(flags, "out");
      if (outPath) {
        await writeFile(resolve(outPath), result.content, "utf8");
        const summary = {
          out: resolve(outPath),
          pluginId: result.pluginId,
          contentType: result.contentType,
          bytesWritten: Buffer.byteLength(result.content, "utf8"),
          truncated: result.truncated,
          ...(result.nextCursor ? { nextCursor: result.nextCursor } : {}),
        };
        process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
      } else {
        process.stdout.write(result.content.endsWith("\n") ? result.content : `${result.content}\n`);
        if (result.nextCursor) {
          process.stderr.write(`nextCursor: ${result.nextCursor}\n`);
        }
      }
      return 0;
    }

    if (command === "query") {
      const sql = getFlag(flags, "sql");
      if (!sql) {
        throw new AgentError("invalid-argument", "Missing required --sql option.");
      }
      const maxBytesRaw = getFlag(flags, "max-bytes");
      const maxBytes = maxBytesRaw ? Number(maxBytesRaw) : undefined;
      const result = await service.queryFile(targetPath, {
        sql,
        target: getFlag(flags, "target"),
        cursor: getFlag(flags, "cursor"),
        maxBytes,
      });
      const outPath = getFlag(flags, "out");
      if (outPath) {
        await writeFile(resolve(outPath), result.content, "utf8");
        const summary = {
          out: resolve(outPath),
          pluginId: result.pluginId,
          contentType: result.contentType,
          bytesWritten: Buffer.byteLength(result.content, "utf8"),
          truncated: result.truncated,
          ...(result.nextCursor ? { nextCursor: result.nextCursor } : {}),
        };
        process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
      } else {
        process.stdout.write(result.content.endsWith("\n") ? result.content : `${result.content}\n`);
        if (result.nextCursor) {
          process.stderr.write(`nextCursor: ${result.nextCursor}\n`);
        }
      }
      return 0;
    }

    throw new AgentError("invalid-argument", `Unknown command: ${command}`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify(toAgentFileError(error))}\n`);
    return 1;
  } finally {
    await service.dispose();
  }
}
