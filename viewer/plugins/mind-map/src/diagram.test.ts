import { describe, expect, it, vi } from "vitest";
import { strToU8, zipSync } from "fflate";
import { createViewerTestContext } from "@anyfile/viewer-test";
import { parseContent, readMindMap } from "./parse";
import { layoutMap } from "./layout";
import { mindMapViewer } from "./index";
const signal = () => new AbortController().signal;
const measure = (text: string, font: number) => text.length * font * .6;
const modern = [{ title: "Map", rootTopic: { id: "root", title: "Root", children: {
  attached: [{ id: "a", title: "A", children: { attached: [{ id: "deep", title: "Deep" }] } }, { id: "b", title: "B" }],
  detached: [{ id: "floating", title: "Floating", position: { x: -800, y: 300 } }],
  summary: [{ id: "summary", title: "Summary" }], callout: [{ id: "callout", title: "Callout" }],
}, summaries: [{ range: "(0,1)", topicId: "summary" }], boundaries: [{ range: "(0,1)", title: "Group" }] }, relationships: [{ end1Id: "a", end2Id: "b", title: "Related" }] }];
function zipFile(content: unknown, assets: Record<string, Uint8Array> = {}) {
  return new File([zipSync({ "content.json": strToU8(JSON.stringify(content)), ...assets }) as Uint8Array<ArrayBuffer>], "map.xmind");
}

describe("mind map visual semantics", () => {
  it("renders the whole hierarchy, relationships, boundaries and distinct topic kinds", async () => {
    const test = createViewerTestContext(zipFile(modern));
    const controller = await mindMapViewer.open(test.context);
    try {
      expect(test.container.querySelectorAll(".mm-node")).toHaveLength(7);
      expect(test.container.querySelectorAll(".mm-branch")).toHaveLength(4);
      expect(test.container.querySelectorAll(".mm-relationship")).toHaveLength(1);
      expect(test.container.querySelectorAll(".mm-boundary")).toHaveLength(1);
      expect(test.container.querySelector('[data-topic-id="floating"]')?.getAttribute("data-kind")).toBe("detached");
      expect(test.container.querySelector('[data-topic-id="summary"]')?.getAttribute("data-kind")).toBe("summary");
    } finally { await controller.dispose(); test.cleanup(); }
  });
  it("preserves explicit left/right sides, floating coordinates and source data across layouts", () => {
    const sheets = parseContent('<map><node ID="r" TEXT="Root"><node ID="l" TEXT="Left" POSITION="left"><node TEXT="Leaf"/></node><node ID="q" TEXT="Right" POSITION="right"/></node></map>', "mm", signal());
    const before = JSON.stringify(sheets);
    const { boxes } = layoutMap(sheets[0], new Set(), measure);
    expect(boxes.find(b => b.topic.id === "l")!.x).toBeLessThan(boxes[0].x);
    expect(boxes.find(b => b.topic.id === "q")!.x).toBeGreaterThan(boxes[0].x);
    expect(JSON.stringify(sheets)).toBe(before);
    const map = parseContent(JSON.stringify(modern), "xmind-json", signal())[0];
    const layout = layoutMap(map, new Set(), measure);
    const root = layout.boxes.find(b => b.topic.id === "root")!, floating = layout.boxes.find(b => b.topic.id === "floating")!;
    expect(floating.parent).toBeUndefined();
    expect(floating.x - (root.x + root.width / 2)).toBe(-800);
    expect(floating.y - (root.y + root.height / 2)).toBe(300);
  });
  it.each(["org.xmind.ui.logic.right", "org.xmind.ui.logic.left", "org.xmind.ui.tree.down", "org.xmind.ui.tree.up"])("lays out %s without overlapping topic boxes", structureClass => {
    const map = parseContent(JSON.stringify([{ rootTopic: { title: "Root", structureClass, children: { attached: Array.from({ length: 5 }, (_, i) => ({ title: `Branch ${i}`, children: { attached: [{ title: "A long descendant title" }, { title: "B" }] } })) } } }]), "xmind-json", signal())[0];
    const { boxes } = layoutMap(map, new Set(), measure);
    for (let i = 0; i < boxes.length; i++) for (let j = i+1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      expect(a.x+a.width <= b.x || b.x+b.width <= a.x || a.y+a.height <= b.y || b.y+b.height <= a.y).toBe(true);
    }
  });
  it("retains visual styles, icons, attributes, links and folded state from Freeplane", () => {
    const map = parseContent('<map><node ID="r" TEXT="Root" COLOR="#112233" BACKGROUND_COLOR="#ffeedd" FOLDED="true"><font SIZE="18" BOLD="true"/><edge COLOR="#abcdef"/><icon BUILTIN="idea"/><attribute NAME="Progress" VALUE="50"/><arrowlink DESTINATION="c"/><node ID="c" TEXT="Child"/></node></map>', "mm", signal())[0];
    expect(map.root.style).toMatchObject({ color: "#112233", fill: "#ffeedd", stroke: "#abcdef", fontSize: 18, bold: true });
    expect(map.root.markers).toEqual(["idea"]);
    expect(map.root.metadata.Progress).toBe("50");
    expect(map.root.relationships[0].to).toBe("c");
    expect(layoutMap(map, new Set([map.root]), measure).boxes).toHaveLength(1);
  });
  it("inherits XMind theme styles and honors per-topic overrides", () => {
    const map = parseContent(JSON.stringify([{ theme: { centralTopic: { properties: { "svg:fill": "#112233", "fo:font-size": "24pt" } }, mainTopic: { properties: { "fo:color": "#123456" } } }, rootTopic: { title: "Root", style: { properties: { "svg:fill": "#abcdef" } }, children: { attached: [{ title: "Child" }] } } }]), "xmind-json", signal())[0];
    expect(map.root.style).toMatchObject({ fill: "#abcdef", fontSize: 24 });
    expect(map.root.children[0].style.color).toBe("#123456");
  });
  it("loads local images and text attachments, sanitizes SVG, and releases image URLs", async () => {
    const content = [{ rootTopic: { title: "Image", image: { src: "xap:resources/image.svg" }, children: { attached: [{ title: "note.txt", href: "xap:attachments/note.txt" }] } } }];
    const file = zipFile(content, { "resources/image.svg": strToU8('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><script>alert(1)</script><image href="https://example.com/tracker"/><rect width="100" height="50" fill="red"/></svg>'), "attachments/note.txt": strToU8("Local attachment content") });
    const maps = await readMindMap(file, signal());
    const blob = maps[0].assets!.get("xap:resources/image.svg")!;
    expect(await blob.text()).not.toMatch(/script|https:/);
    expect(maps[0].attachmentText?.get("xap:attachments/note.txt")).toBe("Local attachment content");
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const test = createViewerTestContext(file);
    const controller = await mindMapViewer.open(test.context);
    try {
      expect(test.container.querySelector("image")?.getAttribute("href")).toBe("blob:test");
      test.container.querySelector('[aria-label="note.txt"]')!.dispatchEvent(new MouseEvent("click"));
      expect(test.container.textContent).toContain("Local attachment content");
      await controller.dispose(); await controller.dispose();
      expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:test");
    } finally { await controller.dispose(); test.cleanup(); create.mockRestore(); revoke.mockRestore(); }
  });
  it("does not turn XML formatting whitespace into empty title lines", () => {
    const map = parseContent('<map><node><richcontent TYPE="NODE">\n<html>\n<body>\n<p>\n<b>Tutorial</b>\n</p>\n<p>Freeplane</p>\n</body>\n</html>\n</richcontent></node></map>', "mm", signal())[0];
    expect(map.root.title).toBe("Tutorial\nFreeplane");
  });
  it("reads MindManager defaults, floating topics, relationship endpoints and tasks", () => {
    const source = '<Map><OneTopic><Topic OId="r"><Text PlainText="Root"/><Task TaskPercentage="50" DeadlineDate="2026-10-20"/><SubTopics><Topic OId="a"><Text PlainText="Child"/></Topic></SubTopics><FloatingTopics><Topic OId="f"><Text PlainText="Floating"/></Topic></FloatingTopics></Topic></OneTopic><StyleGroup><RootTopicDefaultsGroup><DefaultColor FillColor="ff112233"/><DefaultText><Font Size="20"/></DefaultText><DefaultSubTopicsShape SubTopicsGrowthDirection="urn:mindjet:Right"/></RootTopicDefaultsGroup></StyleGroup><Relationships><Relationship><ConnectionGroup Index="0"><Connection OIdRef="a"/></ConnectionGroup><ConnectionGroup Index="1"><Connection OIdRef="f"/></ConnectionGroup></Relationship></Relationships></Map>';
    const sheet = parseContent(source, "mmap", signal())[0];
    expect(sheet.root.title).toBe("Root");
    expect(sheet.root.style).toMatchObject({ fill: "#112233ff", fontSize: 20 });
    expect(sheet.root.structure).toBe("logic.right");
    expect(sheet.root.children[1].kind).toBe("detached");
    expect(sheet.root.metadata.TaskPercentage).toBe("50");
    expect(sheet.relationships).toEqual([{ from: "a", to: "f", title: "" }]);
  });
  it("reads workspace images without requesting remote or parent paths", async () => {
    const file = new File(['<map><node TEXT="Root"><richcontent TYPE="NODE"><html><img src="images/a.png"/></html></richcontent><node TEXT="Remote"><richcontent TYPE="NODE"><html><img src="https://example.com/a.png"/></html></richcontent></node><node TEXT="Parent"><richcontent TYPE="NODE"><html><img src="../private.png"/></html></richcontent></node></node></map>'], "local.mm");
    const open = vi.fn().mockResolvedValue(new File([new Uint8Array([137,80,78,71])], "a.png"));
    const workspace = { open, async *list() {} };
    const maps = await readMindMap(file, signal(), workspace);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0][0]).toBe("images/a.png");
    expect(maps[0].assets?.has("images/a.png")).toBe(true);
  });
  it("searches hidden descendants and expands only their ancestors", async () => {
    const file = new File(['<map><node TEXT="Root" FOLDED="true"><node TEXT="Hidden"><node TEXT="Target"/></node><node TEXT="Other" FOLDED="true"><node TEXT="Remain hidden"/></node></node></map>'], "folded.mm");
    const test = createViewerTestContext(file); const controller = await mindMapViewer.open(test.context);
    try {
      expect(test.container.querySelectorAll(".mm-node")).toHaveLength(1);
      const search = test.container.querySelector("input")!; search.value = "Target"; search.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
      expect(test.container.querySelector("h2")?.textContent).toBe("Target");
      expect(test.container.querySelectorAll(".mm-node")).toHaveLength(4);
      const canvas = test.container.querySelector("svg")!, before = canvas.getAttribute("viewBox");
      canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "+" }));
      expect(canvas.getAttribute("viewBox")).not.toBe(before);
    } finally { await controller.dispose(); test.cleanup(); }
  });
});
