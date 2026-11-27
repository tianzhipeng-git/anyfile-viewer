import { createInterface } from "node:readline";
import { AgentError } from "@anyfile/viewer-protocol";
import { AgentService } from "./agent-core";
import { toAgentFileError } from "./budget";

interface JsonRpcRequest {
  readonly jsonrpc?: string;
  readonly id?: string | number | null;
  readonly method: string;
  readonly params?: Record<string, unknown>;
}

const MCP_TOOLS = [
  {
    name: "inspect_file",
    description:
      "Inspect a local file to identify its format, supported capabilities (read/query/render), metadata, and readable targets.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the local file." },
      },
      required: ["path"],
    },
  },
  {
    name: "read_file",
    description:
      "Read structured text, Markdown, or JSON from a local file target with optional cursor pagination, keyword filter, and byte budget.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the local file." },
        target: { type: "string", description: "Target id copied from inspect_file targets." },
        cursor: { type: "string", description: "Opaque nextCursor from a previous read_file call." },
        filter: { type: "string", description: "Optional keyword filter." },
        maxBytes: { type: "number", description: "Max UTF-8 bytes to return (default 49152, max 262144)." },
      },
      required: ["path"],
    },
  },
  {
    name: "query_file",
    description:
      "Run a read-only SQL query against a supported database file (e.g. SQLite, DuckDB).",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the local database file." },
        sql: { type: "string", description: "Read-only SQL SELECT/WITH/PRAGMA query." },
        target: { type: "string", description: "Optional target database/schema id." },
        cursor: { type: "string", description: "Opaque nextCursor from a previous query_file call." },
        maxBytes: { type: "number", description: "Max UTF-8 bytes to return (default 49152, max 262144)." },
      },
      required: ["path", "sql"],
    },
  },
  {
    name: "render_file",
    description:
      "Render a local file (image, document, CAD, 3D, etc.) to a bounded PNG image.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the local file." },
        target: { type: "string", description: "Optional target id (e.g. page or view) from inspect_file." },
        maxDimension: { type: "number", description: "Max width or height in pixels (default 1600, max 4096)." },
      },
      required: ["path"],
    },
  },
] as const;

export interface McpServerOptions {
  readonly allowedRoots: readonly string[];
  readonly input?: NodeJS.ReadableStream;
  readonly output?: NodeJS.WritableStream;
}

export async function runMcpServer(options: McpServerOptions): Promise<void> {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const service = new AgentService({
    allowedRoots: options.allowedRoots,
    persistent: true,
  });

  const send = (payload: Record<string, unknown>) => {
    output.write(`${JSON.stringify({ jsonrpc: "2.0", ...payload })}\n`);
  };

  async function handleToolCall(name: string, args: Record<string, unknown>) {
    try {
      const path = typeof args.path === "string" ? args.path : "";
      if (!path) {
        throw new AgentError("invalid-argument", "Missing required parameter: path.");
      }

      if (name === "inspect_file") {
        const result = await service.inspectFile(path);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      if (name === "read_file") {
        const result = await service.readFile(path, {
          target: typeof args.target === "string" ? args.target : undefined,
          cursor: typeof args.cursor === "string" ? args.cursor : undefined,
          filter: typeof args.filter === "string" ? args.filter : undefined,
          maxBytes: typeof args.maxBytes === "number" ? args.maxBytes : undefined,
        });
        const meta = {
          pluginId: result.pluginId,
          contentType: result.contentType,
          truncated: result.truncated,
          ...(result.nextCursor ? { nextCursor: result.nextCursor } : {}),
          ...(result.filterApplied !== undefined ? { filterApplied: result.filterApplied } : {}),
        };
        return {
          content: [
            { type: "text", text: `${result.content}\n\n---\n${JSON.stringify(meta)}` },
          ],
        };
      }

      if (name === "query_file") {
        const sql = typeof args.sql === "string" ? args.sql : "";
        if (!sql.trim()) {
          throw new AgentError("invalid-argument", "Missing required parameter: sql.");
        }
        const result = await service.queryFile(path, {
          sql,
          target: typeof args.target === "string" ? args.target : undefined,
          cursor: typeof args.cursor === "string" ? args.cursor : undefined,
          maxBytes: typeof args.maxBytes === "number" ? args.maxBytes : undefined,
        });
        const meta = {
          pluginId: result.pluginId,
          contentType: result.contentType,
          truncated: result.truncated,
          ...(result.nextCursor ? { nextCursor: result.nextCursor } : {}),
        };
        return {
          content: [
            { type: "text", text: `${result.content}\n\n---\n${JSON.stringify(meta)}` },
          ],
        };
      }

      if (name === "render_file") {
        const result = await service.renderFile(path, {
          target: typeof args.target === "string" ? args.target : undefined,
          maxDimension: typeof args.maxDimension === "number" ? args.maxDimension : undefined,
        });
        const meta = {
          pluginId: result.pluginId,
          engine: result.engine,
          width: result.width,
          height: result.height,
          ...(result.targetIgnored ? { targetIgnored: true } : {}),
        };
        return {
          content: [
            { type: "image", data: Buffer.from(result.png).toString("base64"), mimeType: "image/png" },
            { type: "text", text: JSON.stringify(meta) },
          ],
        };
      }

      throw new AgentError("invalid-argument", `Unknown tool: ${name}`);
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify(toAgentFileError(error)) }],
      };
    }
  }

  const rl = createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const rawLine of rl) {
      const line = rawLine.trim();
      if (!line) continue;

      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        send({ id: null, error: { code: -32700, message: "Parse error" } });
        continue;
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        send({ id: null, error: { code: -32600, message: "Invalid Request" } });
        continue;
      }
      const req = parsed as JsonRpcRequest;

      // Notifications have no id and expect no response.
      if (req.id === undefined) continue;

      if (req.method === "initialize") {
        send({
          id: req.id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "@anyfile/agent", version: "0.2.0" },
          },
        });
      } else if (req.method === "ping") {
        send({ id: req.id, result: {} });
      } else if (req.method === "tools/list") {
        send({ id: req.id, result: { tools: MCP_TOOLS } });
      } else if (req.method === "tools/call") {
        const params = req.params ?? {};
        const name = typeof params.name === "string" ? params.name : "";
        const args =
          params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments)
            ? (params.arguments as Record<string, unknown>)
            : {};
        const result = await handleToolCall(name, args);
        send({ id: req.id, result });
      } else {
        send({
          id: req.id,
          error: { code: -32601, message: `Method not found: ${req.method}` },
        });
      }
    }
  } finally {
    await service.dispose();
  }
}
