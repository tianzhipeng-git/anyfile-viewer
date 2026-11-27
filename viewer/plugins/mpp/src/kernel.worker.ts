import { importRuntime } from "@anyfile/runtime-assets";
import { EngineError, parseProject, startMppRuntime, type ParseMpp } from "./engine";
import { RUNTIME_FILES, type Request, type Response } from "./types";

let parse: ParseMpp | undefined;
const send = (message: Response) => self.postMessage(message);
self.onmessage = async ({ data }: MessageEvent<Request>) => {
  try {
    if (data.type === "init") {
      await importRuntime(`${data.baseUrl}${RUNTIME_FILES.glue}`);
      const response = await fetch(`${data.baseUrl}${RUNTIME_FILES.wasm}`);
      if (!response.ok) throw new Error("Runtime fetch failed");
      parse = await startMppRuntime(await response.arrayBuffer(), () => send({ type: "error", code: "unsupported-environment" }));
      send({ type: "ready" });
      return;
    }
    send({ type: "opened", document: parseProject(parse!, new Uint8Array(data.bytes)) });
  } catch (error) {
    send({ type: "error", code: data.type === "init" ? "unsupported-environment" : error instanceof EngineError ? error.code : "invalid-file" });
  }
};
