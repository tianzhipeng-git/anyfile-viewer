import { afterEach, expect, it, vi } from "vitest";
import { createViewerTestContext, type ViewerTestContext } from "@anyfile/viewer-test";
import { cadExchangeViewer } from "./index";
vi.mock("@anyfile/rendering-3d", async (original) => {
  const actual = await original<typeof import("@anyfile/rendering-3d")>();
  return { ...actual, create3dViewer(container: HTMLElement, document: Parameters<typeof actual.create3dViewer>[1]) {
    actual.inspectObject(document.root); const root = window.document.createElement("canvas"); container.append(root);
    return { root, dispose() { actual.disposeObject(document.root); root.remove(); } };
  } };
});
class TestWorker {
  static instances: TestWorker[] = [];
  onmessage?: (event: {data: unknown}) => void;
  onerror?: () => void;
  terminate = vi.fn(); postMessage = vi.fn();
  constructor() { TestWorker.instances.push(this); }
}
const contexts: ViewerTestContext[] = [];
function contextFor() { vi.stubGlobal("Worker", TestWorker); const context=createViewerTestContext(new File(["ISO-10303-21;"],"part.step"));contexts.push(context);return context; }
afterEach(()=>{for(const c of contexts.splice(0))c.cleanup();TestWorker.instances=[];vi.unstubAllGlobals();});
it("terminates an opening kernel on abort",async()=>{
 const c=contextFor();const opening=cadExchangeViewer.open(c.context);const rejected=expect(opening).rejects.toMatchObject({name:"AbortError"});
 await vi.waitFor(()=>expect(TestWorker.instances).toHaveLength(1));c.abortController.abort();await rejected;expect(TestWorker.instances[0].terminate).toHaveBeenCalledOnce();expect(c.container.childElementCount).toBe(0);
});
it("releases the kernel after a result and the scene after repeated dispose",async()=>{
 const c=contextFor();const opening=cadExchangeViewer.open(c.context);await vi.waitFor(()=>expect(TestWorker.instances).toHaveLength(1));
 TestWorker.instances[0].onmessage!({data:{type:"ready"}});
 await vi.waitFor(()=>expect(TestWorker.instances[0].postMessage).toHaveBeenCalledTimes(2));
 TestWorker.instances[0].onmessage!({data:{type:"opened",result:{root:{name:"part",meshes:[0],children:[]},origin:[0,0,0],heapBytes:33554432,meshes:[{name:"triangle",positions:new Float32Array([0,0,0,1,0,0,0,1,0]),indices:new Uint32Array([0,1,2]),colors:new Float32Array(9),edges:new Float32Array()}]}}});
 const controller=await opening;expect(TestWorker.instances[0].terminate).toHaveBeenCalledOnce();expect(c.container.querySelector("canvas")).toBeTruthy();
 c.abortController.abort();await controller.dispose();await controller.dispose();expect(c.container.childElementCount).toBe(0);expect(c.outside.dataset.viewerTestOutside).toBe("untouched");
});
