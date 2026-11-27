import { realpath, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { AgentError } from "@anyfile/viewer-protocol";
import { AgentService } from "./agent-core";
import { toAgentFileError } from "./budget";
import { addVendorCache, clearVendorCache, listVendorCache } from "./cache";
import { runMcpServer } from "./mcp";

const BOOLEAN_FLAGS = new Set(["help"]);

export function parseFlags(args: readonly string[]): {
  readonly positionals: string[];
  readonly flags: Map<string, string[]>;
} {
  const positionals: string[] = [];
  const flags = new Map<string, string[]>();
  let endOfOptions = false;
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (!endOfOptions && token === "--") {
      endOfOptions = true;
      continue;
    }
    if (!endOfOptions && token.startsWith("--")) {
      const eq = token.indexOf("=");
      let key: string;
      let value: string;
      if (eq !== -1) {
        key = token.slice(2, eq);
        value = token.slice(eq + 1);
      } else {
        key = token.slice(2);
        if (BOOLEAN_FLAGS.has(key)) {
          value = "true";
        } else {
          const next = args[i + 1];
          if (next === undefined) {
            throw new AgentError("invalid-argument", `Missing value for option: --${key}`);
          }
          value = next;
          i += 1;
        }
      }
      if (!key) {
        throw new AgentError("invalid-argument", "Invalid empty option name.");
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

function parsePositiveIntFlag(raw: string | undefined, flagName: string): number | undefined {
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new AgentError("invalid-argument", `Invalid --${flagName} value: ${raw}`);
  }
  return parsed;
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
      "  render <path> [--target t] [--max-dim px] [--out file] Render bounded PNG image",
      "  cache <list|add <pluginIds...|all>|clear>             Manage local /vendor/ runtime asset cache",
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

  let positionals: string[];
  let flags: Map<string, string[]>;
  try {
    ({ positionals, flags } = parseFlags(rest));
  } catch (error) {
    process.stderr.write(`${JSON.stringify(toAgentFileError(error))}\n`);
    return 1;
  }

  if (command === "mcp") {
    const allowDirs = flags.get("allow-dir") ?? [];
    const allowedRoots = [process.cwd(), ...allowDirs];
    await runMcpServer({ allowedRoots });
    return 0;
  }

  if (command === "cache") {
    const sub = positionals[0] ?? "list";
    try {
      if (sub === "list") {
        const info = await listVendorCache();
        process.stdout.write(`${JSON.stringify(info, null, 2)}\n`);
        return 0;
      }
      if (sub === "add") {
        const info = await addVendorCache(positionals.slice(1));
        process.stdout.write(`${JSON.stringify(info, null, 2)}\n`);
        return 0;
      }
      if (sub === "clear") {
        const info = await clearVendorCache();
        process.stdout.write(`${JSON.stringify(info, null, 2)}\n`);
        return 0;
      }
      throw new AgentError("invalid-argument", `Unsupported cache subcommand: ${sub}`);
    } catch (error) {
      process.stderr.write(`${JSON.stringify(toAgentFileError(error))}\n`);
      return 1;
    }
  }

  const targetPath = positionals[0];
  if (!targetPath) {
    process.stderr.write(`${JSON.stringify(toAgentFileError(new AgentError("invalid-argument", "Missing file path argument.")))}\n`);
    return 1;
  }

  const resolvedTarget = resolve(targetPath);
  let resolvedParent = dirname(resolvedTarget);
  try {
    resolvedParent = dirname(await realpath(resolvedTarget));
  } catch {
    // Let resolveAllowedFile report access-denied for non-existent paths.
  }
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
      const maxBytes = parsePositiveIntFlag(getFlag(flags, "max-bytes"), "max-bytes");
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
      const maxBytes = parsePositiveIntFlag(getFlag(flags, "max-bytes"), "max-bytes");
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

    if (command === "render") {
      const maxDimension = parsePositiveIntFlag(getFlag(flags, "max-dim"), "max-dim");
      const result = await service.renderFile(targetPath, {
        target: getFlag(flags, "target"),
        maxDimension,
      });
      const outPath = getFlag(flags, "out");
      if (outPath) {
        await writeFile(resolve(outPath), result.png);
        const summary = {
          out: resolve(outPath),
          pluginId: result.pluginId,
          engine: result.engine,
          width: result.width,
          height: result.height,
          bytesWritten: result.png.byteLength,
          ...(result.targetIgnored ? { targetIgnored: true } : {}),
        };
        process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
      } else {
        process.stdout.write(result.png);
        if (result.targetIgnored) {
          process.stderr.write("Note: target selection is not supported by this plugin; rendered default view.\n");
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
