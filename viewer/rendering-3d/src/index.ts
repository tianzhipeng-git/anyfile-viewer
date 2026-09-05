import { AmbientLight, AnimationMixer, type AnimationClip, DirectionalLight, Group, Mesh, Object3D, OrthographicCamera, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { ViewerError, selectMessages, type Locale } from "@anyfile/viewer-protocol";
import { create3dUi } from "./ui";
import { disposeObject, inspectObject } from "./resources";
export { disposeObject, inspectObject } from "./resources";

export interface Rendering3dDocument {
  root: Object3D;
  up?: "y" | "z";
  planar?: boolean;
  units?: string;
  description?: string;
  animations?: AnimationClip[];
}

// The runtime takes ownership of the document, including initialization failure.
export function create3dViewer(container: HTMLElement, doc: Rendering3dDocument, locale: Locale, title: string) {
  const copy = selectMessages(locale, {
    en: { unsupported: "WebGL 2 is unavailable.", limit: "The model exceeds the geometry or GPU budget.", invalid: "The model contains invalid or empty geometry.", units: "Units unknown", vertices: "vertices", triangles: "triangles", size: "Dimensions" },
    "zh-CN": { unsupported: "当前环境不支持 WebGL 2。", limit: "模型超过几何或 GPU 资源上限。", invalid: "模型几何为空或无效。", units: "单位未知", vertices: "顶点", triangles: "三角面", size: "尺寸" },
  });
  let stats: ReturnType<typeof inspectObject>;
  try { stats = inspectObject(doc.root); } catch (error) {
    disposeObject(doc.root);
    throw new ViewerError(error instanceof RangeError ? "resource-limit" : "invalid-file", error instanceof RangeError ? copy.limit : copy.invalid, { cause: error });
  }
  const ui = create3dUi(container, locale, title);
  let renderer: WebGLRenderer;
  try { renderer = new WebGLRenderer({ antialias: true, alpha: true }); } catch (error) {
    disposeObject(doc.root); ui.root.remove();
    throw new ViewerError("unsupported-environment", copy.unsupported, { cause: error });
  }
  renderer.setClearColor(0, 0);
  ui.viewport.append(renderer.domElement);
  renderer.domElement.tabIndex = 0; renderer.domElement.setAttribute("aria-label", ui.copy.viewport);
  const scene = new Scene();
  const mixer = doc.animations?.length ? new AnimationMixer(doc.root) : undefined;
  let playing = false; let lastTime = 0; let interacted = false;
  const pivot = new Group();
  pivot.add(doc.root); pivot.position.copy(stats.bounds.getCenter(new Vector3()).negate()); scene.add(pivot);
  const light = new DirectionalLight(0xffffff, 2.5); light.position.set(1, 2, 3); scene.add(light, new AmbientLight(0xffffff, 2));
  let radius = Math.max(stats.size.length() / 2, 0.001);
  const ortho = new OrthographicCamera(-radius, radius, radius, -radius, radius / 10000, radius * 10000);
  const perspective = new PerspectiveCamera(45, 1, radius / 10000, radius * 10000);
  const up = doc.up === "z" ? new Vector3(0, 0, 1) : new Vector3(0, 1, 0);
  ortho.up.copy(up); perspective.up.copy(up);
  let camera: OrthographicCamera | PerspectiveCamera = ortho;
  const controls = new OrbitControls<OrthographicCamera | PerspectiveCamera>(camera, renderer.domElement);
  controls.enableDamping = false;
  const onInteraction = () => { interacted = true; };
  controls.addEventListener("start", onInteraction);
  controls.listenToKeyEvents(renderer.domElement);
  let disposed = false; let frame = 0; let lost = false;
  const schedule = () => {
    if (disposed || lost || frame) return;
    frame = requestAnimationFrame((time) => {
      frame = 0;
      if (disposed || lost) return;
      if (playing && mixer) { mixer.update(Math.min(0.1, (time - lastTime) / 1000)); lastTime = time; }
      renderer.render(scene, camera);
      if (playing) schedule();
    });
  };
  const resize = () => {
    const width = Math.max(1, ui.viewport.clientWidth); const height = Math.max(1, ui.viewport.clientHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.setSize(width, height, false);
    const aspect = width / height;
    const extent = radius * 1.25;
    ortho.left = -extent * Math.max(1, aspect); ortho.right = -ortho.left;
    ortho.top = extent * Math.max(1, 1 / aspect); ortho.bottom = -ortho.top;
    perspective.aspect = aspect; ortho.updateProjectionMatrix(); perspective.updateProjectionMatrix(); schedule();
  };
  const fit = (direction?: Vector3) => {
    const offset = direction ?? camera.position.clone().sub(controls.target).normalize();
    const aspect = Math.max(0.01, ui.viewport.clientWidth / Math.max(1, ui.viewport.clientHeight));
    const distance = radius * 1.25 / Math.sin(Math.atan(Math.tan(Math.PI / 8) * Math.min(1, aspect)));
    controls.target.set(0, 0, 0); camera.position.copy(offset.normalize().multiplyScalar(distance)); camera.zoom = 1;
    camera.updateProjectionMatrix(); controls.update(); schedule();
  };
  ui.button(ui.copy.fit, () => fit());
  if (mixer && doc.animations) {
    const select = document.createElement("select"); select.setAttribute("aria-label", ui.copy.animation);
    doc.animations.forEach((clip, index) => { const option = document.createElement("option"); option.value = String(index); option.textContent = clip.name || String(index + 1); select.append(option); });
    ui.toolbar.append(select);
    let selectedAnimation = -1;
    const start = () => {
      const index = Number(select.value);
      if (index !== selectedAnimation) { mixer.stopAllAction(); mixer.clipAction(doc.animations![index]).play(); selectedAnimation = index; }
      lastTime = performance.now(); schedule();
    };
    select.onchange = () => { if (playing) start(); };
    ui.button(ui.copy.play, (button) => { playing = !playing; button.setAttribute("aria-pressed", String(playing)); if (playing) start(); });
  }
  const directions = doc.up === "z" ? [[0, 0, 1], [0, -1, 0], [1, 0, 0], [1, -1, 1]] : [[0, 1, 0], [0, 0, 1], [1, 0, 0], [1, 1, 1]];
  [ui.copy.top, ui.copy.front, ui.copy.right, ui.copy.iso].forEach((name, index) => ui.button(name, () => fit(new Vector3(...directions[index]))));
  ui.button(ui.copy.projection, (button) => {
    const previous = camera; camera = camera === ortho ? perspective : ortho;
    camera.position.copy(previous.position); camera.quaternion.copy(previous.quaternion);
    controls.object = camera; camera.updateProjectionMatrix(); controls.update(); button.setAttribute("aria-pressed", String(camera === perspective)); schedule();
  });
  const zoom = (factor: number) => {
    if (camera === ortho) { camera.zoom = Math.max(0.001, Math.min(10000, camera.zoom * factor)); camera.updateProjectionMatrix(); }
    else camera.position.sub(controls.target).multiplyScalar(1 / factor).add(controls.target);
    controls.update(); schedule();
  };
  ui.button(ui.copy.zoomIn, () => zoom(1.25)); ui.button(ui.copy.zoomOut, () => zoom(0.8));
  let wireframe = false;
  ui.button(ui.copy.wire, (button) => {
    wireframe = !wireframe;
    doc.root.traverse(object => { if (object instanceof Mesh) for (const material of [object.material].flat()) if ("wireframe" in material) material.wireframe = wireframe; });
    button.setAttribute("aria-pressed", String(wireframe)); schedule();
  });
  const objects = doc.root.children;
  if (objects.length > 0 && objects.length <= 256) {
    ui.tree.hidden = false;
    const inputs: HTMLInputElement[] = [];
    const all = ui.button(ui.copy.all, () => { objects.forEach((object, i) => { object.visible = true; inputs[i].checked = true; }); schedule(); });
    ui.tree.append(all);
    objects.forEach((object, index) => {
      const row = document.createElement("label"); const input = document.createElement("input"); input.type = "checkbox"; input.checked = object.visible;
      input.onchange = () => { object.visible = input.checked; schedule(); }; inputs.push(input);
      const name = document.createElement("span"); name.textContent = object.name || String(index + 1);
      const solo = document.createElement("button"); solo.type = "button"; solo.textContent = ui.copy.solo;
      solo.onclick = (event) => { event.preventDefault(); objects.forEach((other, i) => { other.visible = other === object; inputs[i].checked = other.visible; }); schedule(); };
      row.append(input, name, solo); ui.tree.append(row);
    });
  }
  const status = () => `${stats.vertices.toLocaleString(locale)} ${copy.vertices}${stats.triangles ? ` · ${stats.triangles.toLocaleString(locale)} ${copy.triangles}` : ""} · ${copy.size}: ${stats.size.toArray().map(n => n.toPrecision(5)).join(" × ")} · ${doc.units || copy.units}${doc.description ? ` · ${doc.description}` : ""}`;
  ui.status.textContent = status();
  const contextLost = (event: Event) => { event.preventDefault(); lost = true; cancelAnimationFrame(frame); frame = 0; ui.status.textContent = ui.copy.lost; };
  const contextRestored = () => { lost = false; ui.status.textContent = status(); schedule(); };
  renderer.domElement.addEventListener("webglcontextlost", contextLost);
  renderer.domElement.addEventListener("webglcontextrestored", contextRestored);
  controls.addEventListener("change", schedule);
  const observer = new ResizeObserver(resize); observer.observe(ui.viewport);
  resize(); fit(new Vector3(...directions[doc.planar ? 0 : 3]));
  return {
    root: ui.root,
    refresh() {
      if (disposed) return;
      const previous = pivot.position.clone();
      pivot.position.set(0, 0, 0); scene.updateMatrixWorld(true);
      stats = inspectObject(doc.root); ui.status.textContent = status(); radius = Math.max(stats.size.length() / 2, 0.001);
      pivot.position.copy(stats.bounds.getCenter(new Vector3()).negate());
      for (const camera of [ortho, perspective]) { camera.near = radius / 10000; camera.far = radius * 10000; }
      if (interacted) {
        const delta = pivot.position.clone().sub(previous); camera.position.add(delta); controls.target.add(delta); camera.updateProjectionMatrix(); controls.update(); schedule();
      } else { resize(); fit(); }
    },
    dispose() {
      if (disposed) return; disposed = true;
      cancelAnimationFrame(frame); observer.disconnect(); controls.removeEventListener("change", schedule); controls.removeEventListener("start", onInteraction); controls.dispose();
      renderer.domElement.removeEventListener("webglcontextlost", contextLost); renderer.domElement.removeEventListener("webglcontextrestored", contextRestored);
      mixer?.stopAllAction(); mixer?.uncacheRoot(doc.root);
      disposeObject(doc.root); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.width = 0; renderer.domElement.height = 0; ui.root.remove();
    },
  };
}
