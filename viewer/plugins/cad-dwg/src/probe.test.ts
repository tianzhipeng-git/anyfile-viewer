import { expect, it } from "vitest";
import { probeDwg, dwgSignatures } from "./probe";
import type { ProbeViewerContext } from "@anyfile/viewer-protocol";
function context(signature:string, size=128) {
  const bytes = new Uint8Array(size); bytes.set(new TextEncoder().encode(signature).subarray(0,size));
  return {file:new File([bytes],"drawing.dwg"),signal:new AbortController().signal} as ProbeViewerContext;
}
it.each([...dwgSignatures])("recognizes %s by its bounded header",async(signature)=>expect(await probeDwg(context(signature))).toBe(3));
it("rejects truncated and unrelated content",async()=>{expect(await probeDwg(context("AC1032",6))).toBe(0);expect(await probeDwg(context("abcdef"))).toBe(0);});
it("honors cancellation",async()=>{const ctx=context("AC1032");const controller=new AbortController();controller.abort();await expect(probeDwg({...ctx,signal:controller.signal})).rejects.toMatchObject({name:"AbortError"});});
