import { BoxGeometry, Mesh, MeshBasicMaterial } from "three";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { create3dViewer } from "./index";

const gpu = vi.hoisted(() => ({ render: vi.fn(), lost: false, failInitialization: false }));
vi.mock("three", async (original) => ({
  ...await original<typeof import("three")>(),
  WebGLRenderer: class {
    domElement = document.createElement("canvas");
    constructor() { if (gpu.failInitialization) throw new Error("WebGL unavailable"); }
    render = gpu.render;
    getContext() { return { isContextLost: () => gpu.lost }; }
    setClearColor() {}
    setPixelRatio() {}
    setSize() {}
    dispose() {}
    forceContextLoss() {}
  },
}));

const frames = new Map<number, FrameRequestCallback>();
const viewers: ReturnType<typeof create3dViewer>[] = [];
let frameId = 0;

beforeEach(() => {
  gpu.render.mockReset(); gpu.lost = false; gpu.failInitialization = false;
  frames.clear(); frameId = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++frameId, callback); return frameId; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => { frames.delete(id); });
});

afterEach(() => {
  viewers.splice(0).forEach(viewer => viewer.dispose());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

function setup() {
  const onFirstRender = vi.fn();
  const root = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
  const viewer = create3dViewer(document.body, { root }, "en", "Test model", onFirstRender);
  viewers.push(viewer);
  return { viewer, onFirstRender, canvas: viewer.root.querySelector("canvas")! };
}

function draw() {
  const queued = [...frames.values()]; frames.clear();
  queued.forEach(callback => callback(16));
}

it("reports the first completed render once, rather than viewer creation or scheduling", () => {
  const { viewer, onFirstRender } = setup();
  expect(onFirstRender).not.toHaveBeenCalled();
  gpu.render.mockImplementation(() => expect(onFirstRender).not.toHaveBeenCalled());
  draw();
  expect(gpu.render).toHaveBeenCalledOnce();
  expect(onFirstRender).toHaveBeenCalledOnce();
  gpu.render.mockReset();
  viewer.refresh(); draw();
  expect(gpu.render).toHaveBeenCalledOnce();
  expect(onFirstRender).toHaveBeenCalledOnce();
});

it("does not report success when rendering throws", () => {
  const { onFirstRender } = setup();
  gpu.render.mockImplementation(() => { throw new Error("Draw failed"); });
  expect(draw).toThrow("Draw failed");
  expect(onFirstRender).not.toHaveBeenCalled();
});

it("does not report a lost GPU context as a rendered preview", () => {
  const { viewer, onFirstRender, canvas } = setup();
  gpu.lost = true;
  draw();
  expect(onFirstRender).not.toHaveBeenCalled();
  const queued = () => [...frames.values()];
  viewer.refresh();
  const pending = queued();
  canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
  pending.forEach(callback => callback(16));
  expect(onFirstRender).not.toHaveBeenCalled();
  gpu.lost = false;
  canvas.dispatchEvent(new Event("webglcontextrestored"));
  draw();
  expect(onFirstRender).toHaveBeenCalledOnce();
});

it("ignores an already queued frame after disposal", () => {
  const { viewer, onFirstRender } = setup();
  const pending = [...frames.values()];
  viewer.dispose();
  pending.forEach(callback => callback(16));
  expect(gpu.render).not.toHaveBeenCalled();
  expect(onFirstRender).not.toHaveBeenCalled();
});

it("does not report success when WebGL initialization fails", () => {
  gpu.failInitialization = true;
  const onFirstRender = vi.fn();
  const root = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
  expect(() => create3dViewer(document.body, { root }, "en", "Test model", onFirstRender)).toThrow("WebGL 2 is unavailable.");
  expect(onFirstRender).not.toHaveBeenCalled();
  expect(frames.size).toBe(0);
});
