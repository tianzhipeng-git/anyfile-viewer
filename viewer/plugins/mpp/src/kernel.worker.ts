import { hasOleHeader } from "./probe";
import { INPUT_LIMIT, type ProjectDocument, type Request, type Response, type ParserError } from "./types";

type GoRuntime = { importObject: WebAssembly.Imports; run(instance: WebAssembly.Instance): Promise<void> };
type Globals = typeof globalThis & { Go: new () => GoRuntime; anyfileParseMpp(bytes: Uint8Array): string };
const globals = globalThis as Globals;
const send = (message: Response) => self.postMessage(message);
self.onmessage = async ({ data }: MessageEvent<Request>) => {
  try {
    if (data.type === "init") {
      await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ `${data.baseUrl}wasm_exec.js`);
      const go = new globals.Go();
      const response = await fetch(`${data.baseUrl}mpp.wasm`);
      if (!response.ok) throw new Error("Runtime fetch failed");
      const { instance } = await WebAssembly.instantiate(await response.arrayBuffer(), go.importObject);
      void go.run(instance).catch(() => send({ type: "error", code: "unsupported-environment" }));
      if (typeof globals.anyfileParseMpp !== "function") throw new Error("Runtime initialization failed");
      send({ type: "ready" });
      return;
    }
    if (data.bytes.byteLength > INPUT_LIMIT) { send({ type: "error", code: "resource-limit" }); return; }
    if (!hasOleHeader(new Uint8Array(data.bytes))) { send({ type: "error", code: "invalid-file" }); return; }
    const parsed = JSON.parse(globals.anyfileParseMpp(new Uint8Array(data.bytes))) as ProjectDocument | { error: ParserError };
    if ("error" in parsed) send({ type: "error", code: parsed.error });
    else send({ type: "opened", document: parsed });
  } catch {
    send({ type: "error", code: data.type === "init" ? "unsupported-environment" : "invalid-file" });
  }
};
