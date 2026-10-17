import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { strToU8, zipSync } from "fflate";
import { validateManifest } from "@anyfile/viewer-protocol";
import { createDeferredFile, createViewerTestContext, type ViewerTestContext } from "@anyfile/viewer-test";
import { mindMapViewer } from "./index";
import { mindMapManifest } from "./manifest";
import { probeMindMap } from "./probe";
import { LIMITS, parseContent, readMindMap } from "./parse";

const contexts: ViewerTestContext[] = [];
const signal = () => new AbortController().signal;
const mm = '<map version="1.0.1"><node TEXT="计划"><node TEXT="设计"><richcontent TYPE="NOTE"><html><body><p>中文备注</p></body></html></richcontent><node TEXT="原型"/></node><node TEXT="开发" LINK="https://example.com/"/></node></map>';
const modern = JSON.stringify([{ title: "画布一", rootTopic: { title: "计划", children: { attached: [{ title: "设计", notes: { plain: { content: "中文备注" } } }], detached: [{ title: "自由主题" }] } } }, { title: "画布二", rootTopic: { title: "第二中心" } }]);
const legacy = '<xmap-content xmlns="urn:xmind:xmap:xmlns:content:2.0"><sheet><title>旧版画布</title><topic><title>计划</title><children><topics type="attached"><topic><title>设计</title><notes><plain>中文备注</plain></notes></topic></topics></children></topic></sheet></xmap-content>';
const manager = '<ap:Map xmlns:ap="http://schemas.mindjet.com/MindManager/Application/2003"><ap:OneTopic><ap:Topic><ap:Text PlainText="计划"/><ap:SubTopics><ap:Topic><ap:Text PlainText="设计"/><ap:NotesGroup><ap:NotesXhtmlData><html xmlns="http://www.w3.org/1999/xhtml"><body><p>中文备注</p></body></html></ap:NotesXhtmlData></ap:NotesGroup></ap:Topic></ap:SubTopics></ap:Topic></ap:OneTopic></ap:Map>';
function archive(name: string, path: string, content: string, level: 0 | 6 = 0) {
  return new File([zipSync({ [path]: strToU8(content) }, { level }) as Uint8Array<ArrayBuffer>], name);
}
function context(file = new File([mm], "ideas.mm")) {
  const test = createViewerTestContext(file); contexts.push(test); return test;
}
const click = (test: ViewerTestContext, label: string) => {
  const button = Array.from(test.container.querySelectorAll("button")).find((item) => item.textContent === label);
  expect(button, label).toBeDefined(); button!.click();
};
afterEach(() => { for (const test of contexts.splice(0)) test.cleanup(); });

describe("mind map format support", () => {
  it("has a valid localized manifest and conservative routing level", async () => {
    validateManifest(mindMapManifest);
    for (const name of ["ideas.XMIND", "ideas.MMAP", "ideas.MM"]) {
      expect(await probeMindMap({ file: new File([mm], name), signal: signal() })).toBe(3);
    }
    expect(await probeMindMap({ file: new File([], "unknown.zip"), signal: signal() })).toBe(0);
    const abort = new AbortController(); abort.abort();
    await expect(probeMindMap({ file: new File([], "ideas.mm"), signal: abort.signal })).rejects.toMatchObject({ name: "AbortError" });
  });
  it.each([
    ["FreeMind", () => new File([mm], "ideas.mm")],
    ["XMind JSON", () => archive("ideas.xmind", "content.json", modern)],
    ["XMind XML", () => archive("ideas.xmind", "content.xml", legacy)],
    ["MindManager", () => archive("ideas.mmap", "Document.xml", manager)],
    ["XMind deflated", () => archive("ideas.xmind", "content.json", modern, 6)],
  ])("opens %s through the real reader and renders child notes", async (_name, fixture) => {
    const test = context(fixture());
    const preview = vi.fn();
    const wholeRead = vi.spyOn(test.context.file, "arrayBuffer");
    const controller = await mindMapViewer.open({ ...test.context, reportPreview: preview });
    expect(test.container.querySelector("h2")?.textContent).toBe("计划");
    const branch = test.container.querySelector<HTMLButtonElement>(".mm-branches button")!;
    branch.click();
    expect(test.container.querySelector("h2")?.textContent).toBe("设计");
    expect(test.container.textContent).toContain("中文备注");
    expect(preview).toHaveBeenCalledExactlyOnceWith({ outcome: "success", kind: "structure" });
    expect(wholeRead).not.toHaveBeenCalled();
    click(test, "上级主题");
    expect(test.container.querySelector("h2")?.textContent).toBe("计划");
    await controller.dispose(); await controller.dispose();
    expect(test.container.children).toHaveLength(0);
    expect(test.outside.dataset.viewerTestOutside).toBe("untouched");
  });
  it("retains summary and callout topics from modern XMind files", async () => {
    const source = JSON.stringify([{ rootTopic: { title: "Root", children: {
      attached: [{ title: "Child" }], summary: [{ title: "Summary" }], callout: [{ title: "Callout" }],
    } } }]);
    const maps = await readMindMap(archive("modern.xmind", "content.json", source), signal());
    expect(maps[0].root.children.map(node => node.title)).toEqual(["Child", "Summary", "Callout"]);
    const test = context(archive("modern.xmind", "content.json", source));
    const controller = await mindMapViewer.open(test.context);
    click(test, "Callout (0)");
    expect(test.container.querySelector("h2")?.textContent).toBe("Callout");
    await controller.dispose();
  });
  it("switches XMind sheets and includes floating topics", async () => {
    const test = context(archive("ideas.xmind", "content.json", modern));
    const controller = await mindMapViewer.open(test.context);
    expect(test.container.textContent).toContain("自由主题");
    const select = test.container.querySelector("select")!;
    select.value = "1"; select.dispatchEvent(new Event("change"));
    expect(test.container.querySelector("h2")?.textContent).toBe("第二中心");
    await controller.dispose();
  });
  it("supports Freeplane rich node titles, notes and details without active HTML", async () => {
    const file = new File(['<map><node><richcontent TYPE="NODE"><html><body><p>富文本标题</p><script>bad()</script><img src="https://example.com/tracker"/></body></html></richcontent><richcontent TYPE="DETAILS"><html><body>详情</body></html></richcontent><node TEXT="&lt;img src=x onerror=bad()&gt;" LINK="javascript:bad()"/></node></map>'], "rich.mm");
    const test = context(file);
    const fetch = vi.spyOn(globalThis, "fetch");
    const controller = await mindMapViewer.open(test.context);
    expect(test.container.querySelector("h2")?.textContent).toBe("富文本标题");
    expect(test.container.textContent).toContain("详情");
    expect(test.container.querySelector("img,script,iframe,a")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    await controller.dispose();
  });
  it("paginates wide maps and can reach the final branch", async () => {
    const content = `<map><node TEXT="Root">${Array.from({ length: 205 }, (_, i) => `<node TEXT="Child ${i}"/>`).join("")}</node></map>`;
    const test = context(new File([content], "wide.mm"));
    const controller = await mindMapViewer.open(test.context);
    expect(test.container.querySelectorAll(".mm-branches button")).toHaveLength(100);
    click(test, "下一组分支"); click(test, "下一组分支");
    expect(test.container.querySelectorAll(".mm-branches button")).toHaveLength(5);
    click(test, "Child 204 (0)");
    expect(test.container.querySelector("h2")?.textContent).toBe("Child 204");
    click(test, "中心主题");
    expect(test.container.querySelector("h2")?.textContent).toBe("Root");
    await controller.dispose();
  });
  it.each([
    new File([""], "empty.mm"), new File(["<html/>"], "wrong.mm"),
    new File(['<!DOCTYPE map [<!ENTITY secret SYSTEM "file:///etc/passwd">]><map><node TEXT="&secret;"/></map>'], "entity.mm"),
    archive("wrong.xmind", "content.json", "{}"), archive("wrong.xmind", "content.xml", "<map/>"),
    archive("wrong.mmap", "Document.xml", "<Map/>"), archive("missing.xmind", "other.xml", "<xmap-content/>"),
    new File(["not zip"], "bad.mmap"), archive("unsafe.xmind", "../content.json", modern),
  ])("rejects invalid input $name without leaking DOM", async (file) => {
    const test = context(file);
    await expect(mindMapViewer.open(test.context)).rejects.toMatchObject({ code: "invalid-file" });
    expect(test.container.children).toHaveLength(0);
  });
  it("rejects input, topic count, text, sheet and depth budgets", async () => {
    const test = context({ name: "huge.mm", size: LIMITS.file + 1 } as File);
    await expect(mindMapViewer.open(test.context)).rejects.toMatchObject({ code: "resource-limit" });
    const deep = '<map>' + '<node TEXT="x">'.repeat(LIMITS.depth + 2) + '</node>'.repeat(LIMITS.depth + 2) + '</map>';
    expect(() => parseContent(deep, "mm", signal())).toThrowError(expect.objectContaining({ code: "resource-limit" }));
    const wide = JSON.stringify([{ rootTopic: { children: { attached: Array.from({ length: LIMITS.nodes }, () => ({ title: "x" })) } } }]);
    expect(() => parseContent(wide, "xmind-json", signal())).toThrowError(expect.objectContaining({ code: "resource-limit" }));
    expect(() => parseContent(JSON.stringify([{ rootTopic: { title: "a".repeat(LIMITS.text + 1) } }]), "xmind-json", signal())).toThrowError(expect.objectContaining({ code: "resource-limit" }));
    expect(() => parseContent(JSON.stringify(Array.from({ length: 129 }, () => ({ rootTopic: {} }))), "xmind-json", signal())).toThrowError(expect.objectContaining({ code: "resource-limit" }));
  });
  it("rejects CRC corruption and over-budget ZIP entries", async () => {
    const bytes = zipSync({ "content.json": strToU8(modern) }, { level: 0 });
    bytes[30 + "content.json".length + 10] ^= 1;
    await expect(readMindMap(new File([bytes], "crc.xmind"), signal())).rejects.toBeDefined();
    const large = archive("large.xmind", "content.json", "a".repeat(LIMITS.content + 1));
    await expect(mindMapViewer.open(context(large).context)).rejects.toMatchObject({ code: "resource-limit" });
  });
  it("cancels before opening, during streaming, and while active", async () => {
    const before = context(); before.abortController.abort();
    await expect(mindMapViewer.open(before.context)).rejects.toMatchObject({ name: "AbortError" });
    expect(before.progress).toHaveLength(0);
    const deferred = createDeferredFile("pending.mm", 100);
    const pending = context(deferred.file);
    const opening = mindMapViewer.open(pending.context);
    pending.abortController.abort();
    await expect(opening).rejects.toMatchObject({ name: "AbortError" });
    expect(deferred.wasCancelled()).toBe(true);
    expect(pending.container.children).toHaveLength(0);
    const active = context();
    const preview = vi.fn();
    const controller = await mindMapViewer.open({ ...active.context, reportPreview: preview });
    const staleButton = active.container.querySelector<HTMLButtonElement>(".mm-branches button")!;
    const progressCount = active.progress.length;
    active.abortController.abort(); staleButton.click();
    await controller.dispose(); await controller.dispose();
    expect(active.container.children).toHaveLength(0);
    expect(active.progress).toHaveLength(progressCount);
    expect(preview).toHaveBeenCalledTimes(1);
  });
  it("falls back to English for untranslated locales", async () => {
    const test = context(); const controller = await mindMapViewer.open({ ...test.context, locale: "de" });
    expect(test.container.textContent).toContain("Parent topic"); await controller.dispose();
  });
  it.each(["planning.mm", "planning.xmind", "planning-legacy.xmind", "planning.mmap"])("opens checked-in example %s", async (name) => {
    const file = new File([readFileSync(`${process.cwd()}/examples/${name}`)], name);
    const maps = await readMindMap(file, signal());
    expect(maps[0].root.title).toBe("项目计划 / Project plan");
    expect(maps[0].root.children).toHaveLength(3);
  });
});
