// Execute the exact browser WASM and Go glue against a local fixture.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const runtime = fileURLToPath(new URL("../../third_party/mppgo/0.0.0-0483da3-anyfile.1/", import.meta.url));
await import(`${runtime}wasm_exec.js`);
const go = new globalThis.Go();
const { instance } = await WebAssembly.instantiate(await readFile(`${runtime}mpp.wasm`), go.importObject);
void go.run(instance);
const input = await readFile(resolve(process.argv[2]));
process.stdout.write(globalThis.anyfileParseMpp(new Uint8Array(input)));
process.exit(0);
