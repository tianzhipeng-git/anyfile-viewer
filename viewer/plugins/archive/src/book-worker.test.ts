import { describe, expect, it, vi } from "vitest";
import { createBookWorker } from "./book-worker";
function worker() { return { terminate: vi.fn(), postMessage: vi.fn(), onmessage: null, onerror: null } as unknown as Worker; }
describe("Book decoder lifecycle", () => {
  it("terminates an opening decoder and rejects outstanding work on abort", async () => {
    const mock = worker(), abort = new AbortController(), client = createBookWorker(mock, abort.signal);
    const pending = client.request({ type:"open" }); abort.abort();
    await expect(pending).rejects.toMatchObject({ name:"AbortError" }); client.dispose();
    expect(mock.terminate).toHaveBeenCalledTimes(1);
    await expect(client.request({type:"read"})).rejects.toMatchObject({name:"AbortError"});
  });
  it("drops canceled page responses without destroying another page request", async () => {
    const mock=worker(), client=createBookWorker(mock,new AbortController().signal), abort=new AbortController();
    const first=client.request({type:"read"},abort.signal), second=client.request({type:"read"});
    abort.abort(); await expect(first).rejects.toMatchObject({name:"AbortError"});
    mock.onmessage!({data:{id:1,result:"late"}} as MessageEvent);
    mock.onmessage!({data:{id:2,result:"current"}} as MessageEvent);
    expect(await second).toBe("current"); expect(mock.terminate).not.toHaveBeenCalled(); client.dispose();
  });
  it("terminates synchronous work on the time budget", async () => {
    vi.useFakeTimers();
    try {
      const mock=worker(),client=createBookWorker(mock,new AbortController().signal);
      const pending=client.request({type:"open"});const rejected=expect(pending).rejects.toMatchObject({code:"resource-limit"});
      await vi.advanceTimersByTimeAsync(60000);await rejected;expect(mock.terminate).toHaveBeenCalledTimes(1);
    } finally {vi.useRealTimers();}
  });
});
