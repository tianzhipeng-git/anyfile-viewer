import { afterEach, expect, it, vi } from "vitest";
import { downloadPublicFile, publicFileLinks, publicFileUrl, PUBLIC_FILE_LIMIT } from "./public-file";

const origin = "https://www.anyfile.top";
const source = "https://raw.githubusercontent.com/mwaskom/seaborn-data/master/iris.csv";
afterEach(() => vi.unstubAllGlobals());

it("allows any HTTPS source and same-origin development samples, rejecting credentials and unsafe URLs", () => {
  for (const url of [source, "https://authors.example.org/datasets/file.csv", "https://bucket.example.net:8443/files/model.glb", "https://cdn.jsdelivr.net/gh/owner/repo/file.csv", `${origin}/samples/animation/animated.apng`]) {
    expect(publicFileUrl(url, origin).href).toBe(url);
  }
  expect(publicFileUrl("http://localhost:3000/samples/test.csv", "http://localhost:3000").href).toContain("localhost:3000");
  for (const url of ["file:///test.csv", "http://raw.githubusercontent.com/a.csv", "https://user:secret@raw.githubusercontent.com/a.csv", `${source}?token=secret`, `${source}#secret`, "https://raw.githubusercontent.com/a%2fb.csv", "https://raw.githubusercontent.com/%ZZ"]) {
    expect(() => publicFileUrl(url, origin)).toThrow();
  }
});

it("keeps the file URL out of the page query and safely encodes Markdown and HTML", () => {
  const links = publicFileLinks("https://raw.githubusercontent.com/a/b/main/a(1).csv", origin, "zh-CN");
  const url = new URL(links.link);
  expect(url.search).toBe("");
  expect(new URLSearchParams(url.hash.slice(1)).get("file")).toBe("https://raw.githubusercontent.com/a/b/main/a(1).csv");
  expect(links.markdown).toContain("open-in-anyfile.svg");
  expect(links.markdown).not.toContain("a(1).csv");
  expect(links.iframe).toContain("/zh-CN/embed#file=");
  expect(links.iframe).toContain('referrerpolicy="no-referrer"');
});

it("downloads into a File without cookies, referrers or redirects", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response("a,b\n1,2", { headers: { "content-type": "text/csv; charset=utf-8" } }));
  vi.stubGlobal("fetch", fetcher);
  const controller = new AbortController();
  const customSource = "https://authors.example.org/data/iris.csv";
  const file = await downloadPublicFile(customSource, origin, controller.signal);
  expect(file.name).toBe("iris.csv");
  expect(file.type).toBe("text/csv");
  expect(await file.text()).toBe("a,b\n1,2");
  expect(fetcher).toHaveBeenCalledWith(new URL(customSource), expect.objectContaining({ credentials: "omit", mode: "cors", redirect: "error", referrerPolicy: "no-referrer", signal: controller.signal }));
});

it("rejects oversized content-length before reading and cancels the stream", async () => {
  const cancel = vi.fn();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new ReadableStream({ cancel }), { headers: { "content-length": String(PUBLIC_FILE_LIMIT + 1) } })));
  await expect(downloadPublicFile(source, origin, new AbortController().signal)).rejects.toMatchObject({ code: "resource-limit" });
  expect(cancel).toHaveBeenCalled();
});

it("enforces the streamed budget even when content-length is absent or understated", async () => {
  const cancel = vi.fn();
  const chunk = new Uint8Array(1024 ** 2);
  let count = 0;
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new ReadableStream({ pull(controller) { if (count++ < 129) controller.enqueue(chunk); }, cancel }), { headers: { "content-length": "1" } })));
  await expect(downloadPublicFile(source, origin, new AbortController().signal)).rejects.toMatchObject({ code: "resource-limit" });
  expect(cancel).toHaveBeenCalled();
});

it("ignores cancelled downloads and rejects HTTP failures", async () => {
  const controller = new AbortController();
  controller.abort();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("abc")));
  await expect(downloadPublicFile(source, origin, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("missing", { status: 404 })));
  await expect(downloadPublicFile(source, origin, new AbortController().signal)).rejects.toMatchObject({ code: "fetch-failed" });
});
