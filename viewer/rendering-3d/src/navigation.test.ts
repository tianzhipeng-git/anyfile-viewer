import { afterEach, describe, expect, it, vi } from "vitest";
import { BoxGeometry, Mesh, MeshBasicMaterial, OrthographicCamera, PerspectiveCamera, Scene, Vector3 } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createNavigation, unitsPerMeter } from "./navigation";
import { create3dUi } from "./ui";

const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).forEach(fn => fn()); document.body.replaceChildren(); });
function setup(zUp = false) {
  const ui = create3dUi(document.body, "en", "Test"); const canvas = document.createElement("canvas"); canvas.tabIndex = 0; ui.viewport.append(canvas);
  const ortho = new OrthographicCamera(-5, 5, 5, -5, 0.01, 1000); ortho.position.set(0, 3, 10); ortho.zoom = 2;
  const perspective = new PerspectiveCamera(45, 1, 0.01, 1000);
  if (zUp) { ortho.up.set(0, 0, 1); perspective.up.copy(ortho.up); ortho.position.set(0, -10, 3); }
  const controls = new OrbitControls<OrthographicCamera | PerspectiveCamera>(ortho, canvas); controls.target.set(0, 1, 0); controls.update();
  let camera: OrthographicCamera | PerspectiveCamera = ortho;
  const scene = new Scene(); const root = new Mesh(new BoxGeometry(10, 1, 10), new MeshBasicMaterial()); scene.add(root);
  const nav = createNavigation({ ui, canvas, controls, perspective, scene, root, locale: "en", radius: 10, units: "m", getCamera: () => camera, setCamera: next => { camera = next; }, schedule: vi.fn(), changed: vi.fn() });
  cleanups.push(() => { nav.dispose(); controls.dispose(); root.geometry.dispose(); root.material.dispose(); });
  const click = (name: string) => { const button = [...ui.root.querySelectorAll("button")].find(button => button.textContent === name); expect(button).toBeDefined(); button!.click(); };
  const key = (key: string) => canvas.dispatchEvent(new KeyboardEvent("keydown", { key, cancelable: true }));
  return { ui, canvas, ortho, perspective, controls, nav, click, key, getCamera: () => camera, root };
}
describe("walkthrough", () => {
  it("converts common physical units", () => { expect(unitsPerMeter("mm")).toBe(1000); expect(unitsPerMeter("foot")).toBeCloseTo(3.28084); expect(unitsPerMeter()).toBeUndefined(); });
  it("restores orthographic position, zoom, direction and orbit target", () => {
    const s = setup(); const position = s.ortho.position.clone(); const quaternion = s.ortho.quaternion.clone(); const target = s.controls.target.clone();
    s.click("Walkthrough"); expect(s.getCamera()).toBe(s.perspective); expect(s.controls.enabled).toBe(false);
    s.click("Forward"); s.click("Rise"); s.click("Return to overview");
    expect(s.getCamera()).toBe(s.ortho); expect(s.ortho.position.distanceTo(position)).toBeLessThan(1e-10); expect(s.ortho.quaternion.angleTo(quaternion)).toBeLessThan(1e-7); expect(s.ortho.zoom).toBe(2); expect(s.controls.target.equals(target)).toBe(true); expect(s.controls.enabled).toBe(true);
  });
  it.each([false, true])("moves horizontally despite looking down and uses the model up axis (%s)", zUp => {
    const s = setup(zUp); s.click("Walkthrough"); const before = s.perspective.position.clone(); s.click("Forward");
    const delta = s.perspective.position.clone().sub(before); expect(delta.dot(s.perspective.up)).toBeCloseTo(0); expect(delta.length()).toBeCloseTo(0.35);
    const next = s.perspective.position.clone(); s.click("Rise"); expect(s.perspective.position.clone().sub(next).dot(s.perspective.up)).toBeCloseTo(0.35);
  });
  it("normalizes diagonal motion, caps long frames and stops on blur", () => {
    const s = setup(); s.click("Walkthrough"); const before = s.perspective.position.clone(); s.key("w"); s.key("d");
    s.nav.update(0); s.nav.update(1000); expect(s.perspective.position.distanceTo(before)).toBeCloseTo(0.07);
    s.canvas.dispatchEvent(new Event("blur")); expect(s.nav.update(2000)).toBe(false);
  });
  it("does not navigate when typing in an input or after disposal", () => {
    const s = setup(); s.click("Walkthrough"); s.ui.root.querySelector("input")!.dispatchEvent(new KeyboardEvent("keydown", { key: "w", bubbles: true })); expect(s.nav.update(0)).toBe(false);
    s.nav.dispose(); s.key("w"); expect(s.nav.update(0)).toBe(false);
  });
  it("places the eye above a picked world-space surface and allows cancel", () => {
    const s = setup(); s.root.position.set(0, 0, 0); s.ortho.position.set(0, 10, 0); s.ortho.lookAt(0, 0, 0); s.ortho.updateProjectionMatrix();
    s.click("Place viewpoint"); s.click("Pick view center"); s.click("Enter here");
    expect(s.getCamera()).toBe(s.perspective); expect(s.perspective.position.y).toBeCloseTo(2.1); expect(s.perspective.getWorldDirection(new Vector3()).y).toBeCloseTo(0);
    const position = s.perspective.position.clone(); s.click("Place viewpoint"); s.click("Cancel placement"); expect(s.perspective.position.equals(position)).toBe(true);
  });
  it("rebases the saved overview when streamed geometry changes the model center", () => {
    const s = setup(); const before = s.ortho.position.clone(); const target = s.controls.target.clone();
    s.click("Walkthrough"); const delta = new Vector3(3, 4, 5); s.nav.rebase(delta); s.click("Return to overview");
    expect(s.ortho.position.distanceTo(before.add(delta))).toBeLessThan(1e-10); expect(s.controls.target.distanceTo(target.add(delta))).toBeLessThan(1e-10);
  });
  it("releases held movement on keyup and lets Escape cancel placement", () => {
    const s = setup(); s.click("Walkthrough"); s.key("w"); expect(s.nav.update(0)).toBe(true);
    window.dispatchEvent(new KeyboardEvent("keyup", { key: "w" })); expect(s.nav.update(20)).toBe(false);
    s.click("Place viewpoint"); s.key("Escape"); expect(s.getCamera()).toBe(s.perspective); s.key("Escape"); expect(s.getCamera()).toBe(s.ortho);
  });
  it("changes field of view with pixel and line scrolling without moving the camera", () => {
    const s = setup(); s.click("Walkthrough");
    const position = s.perspective.position.clone(); const quaternion = s.perspective.quaternion.clone(); const projection = s.perspective.projectionMatrix.clone();
    const wheel = new WheelEvent("wheel", { deltaY: -80, cancelable: true }); s.canvas.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true); expect(s.perspective.fov).toBeCloseTo(56); expect(s.perspective.projectionMatrix.equals(projection)).toBe(false);
    s.canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: 5, deltaMode: WheelEvent.DOM_DELTA_LINE })); expect(s.perspective.fov).toBeCloseTo(60);
    expect(s.perspective.position.equals(position)).toBe(true); expect(s.perspective.quaternion.equals(quaternion)).toBe(true);
    s.canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: -100000 })); expect(s.perspective.fov).toBe(20);
    s.canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: 100000 })); expect(s.perspective.fov).toBe(100);
    s.click("Return to overview"); expect(s.perspective.fov).toBe(45);
  });
  it("handles trackpad pinch without moving the eye and ignores it during placement or after disposal", () => {
    const s = setup(); s.click("Walkthrough");
    const pinch = new WheelEvent("wheel", { deltaY: -20, cancelable: true });
    const position = s.perspective.position.clone(); const quaternion = s.perspective.quaternion.clone();
    // happy-dom WheelEvent extends UIEvent and omits MouseEvent modifier keys.
    Object.defineProperty(pinch, "ctrlKey", { value: true }); s.canvas.dispatchEvent(pinch);
    expect(pinch.defaultPrevented).toBe(true); expect(s.perspective.fov).toBe(50);
    const inward = new WheelEvent("wheel", { deltaY: 20, cancelable: true }); Object.defineProperty(inward, "ctrlKey", { value: true }); s.canvas.dispatchEvent(inward);
    expect(inward.defaultPrevented).toBe(true); expect(s.perspective.fov).toBe(60);
    expect(s.perspective.position.equals(position)).toBe(true); expect(s.perspective.quaternion.equals(quaternion)).toBe(true);
    s.click("Place viewpoint"); const placement = new WheelEvent("wheel", { deltaY: -100, cancelable: true }); Object.defineProperty(placement, "ctrlKey", { value: true }); s.canvas.dispatchEvent(placement);
    expect(placement.defaultPrevented).toBe(false); expect(s.perspective.fov).toBe(60);
    s.click("Cancel placement"); s.nav.dispose(); const disposed = new WheelEvent("wheel", { deltaY: -100, cancelable: true }); Object.defineProperty(disposed, "ctrlKey", { value: true }); s.canvas.dispatchEvent(disposed);
    expect(disposed.defaultPrevented).toBe(false); expect(s.perspective.fov).toBe(60);
  });
  it("ignores hidden geometry and restores overview after placement cancellation", () => {
    const s = setup(); s.root.visible = false; s.click("Place viewpoint"); s.click("Pick view center");
    const enter = [...s.ui.root.querySelectorAll("button")].find(button => button.textContent === "Enter here")!; expect(enter.disabled).toBe(true);
    s.click("Cancel placement"); expect(s.getCamera()).toBe(s.ortho); expect(s.controls.enabled).toBe(true);
  });
});
