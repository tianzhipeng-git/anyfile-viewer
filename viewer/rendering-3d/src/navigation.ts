import { Mesh, MeshBasicMaterial, Object3D, OrthographicCamera, PerspectiveCamera, Quaternion, Raycaster, Scene, SphereGeometry, Vector2, Vector3 } from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { selectMessages, type Locale } from "@anyfile/viewer-protocol";
import type { create3dUi } from "./ui";

type Camera = OrthographicCamera | PerspectiveCamera;
export function unitsPerMeter(units?: string) {
  return ({ m: 1, meter: 1, mm: 1000, millimeter: 1000, centimeter: 100, micron: 1e6, inch: 1 / 0.0254, foot: 1 / 0.3048 } as Record<string, number>)[units ?? ""];
}

export function createNavigation(options: {
  ui: ReturnType<typeof create3dUi>; locale: Locale; canvas: HTMLCanvasElement;
  root: Object3D; scene: Scene; perspective: PerspectiveCamera; controls: OrbitControls<Camera>;
  radius: number; units?: string; getCamera: () => Camera; setCamera: (camera: Camera) => void;
  schedule: () => void; changed: (active: boolean) => void;
}) {
  const { ui, canvas, controls, perspective, schedule } = options;
  const copy = selectMessages(options.locale, {
    en: { roam: "Walkthrough", place: "Place viewpoint", back: "Return to overview", enter: "Enter here", cancel: "Cancel placement", center: "Pick view center", height: "Eye height", speed: "Speed", slow: "Slow", normal: "Normal", fast: "Fast", help: "Drag to look · Scroll / pinch to change field of view · WASD move · Q/E rise / descend · Arrow keys look · Esc return. You can pass through walls.", pick: "Click a visible floor surface, then confirm. Roofs and furniture can also be selected.", ready: "Viewpoint selected. Adjust eye height or enter here.", miss: "No visible surface here. Try another position.", unknown: "model units", forward: "Forward", backward: "Backward", left: "Move left", right: "Move right", rise: "Rise", descend: "Descend" },
    "zh-CN": { roam: "漫游", place: "放置观察点", back: "返回总览", enter: "从这里进入", cancel: "取消放置", center: "选择画面中心", height: "眼高", speed: "速度", slow: "慢", normal: "正常", fast: "快", help: "拖动环顾 · 滚轮/双指滑动或捏合调节视野 · WASD 移动 · Q/E 升降 · 方向键环顾 · Esc 返回。允许穿墙。", pick: "点击可见地面，再确认进入。屋顶和家具也会被选中，请留意标记。", ready: "已选中观察点，可调整眼高或确认进入。", miss: "此处没有可见表面，请选择其他位置。", unknown: "模型单位", forward: "前进", backward: "后退", left: "左移", right: "右移", rise: "上升", descend: "下降" },
  });
  const panel = document.createElement("div"); panel.className = "r3-navigation"; panel.hidden = true;
  ui.toolbar.after(panel);
  const help = document.createElement("div"); help.className = "r3-navigation-help"; help.setAttribute("role", "status");
  const addButton = (text: string, action: () => void) => {
    const button = document.createElement("button"); button.type = "button"; button.textContent = text; button.onclick = action; panel.append(button); return button;
  };
  const scale = unitsPerMeter(options.units);
  const height = document.createElement("input"); height.type = "number"; height.min = "0"; height.step = "any"; height.value = String(scale ? 1.6 : options.radius * 0.1);
  const heightLabel = document.createElement("label"); heightLabel.append(`${copy.height} (${scale ? "m" : copy.unknown}) `, height); panel.append(heightLabel);
  const speed = document.createElement("select");
  [copy.slow, copy.normal, copy.fast].forEach((name, i) => { const option = document.createElement("option"); option.textContent = name; option.value = String([0.3, 1, 3][i]); speed.append(option); }); speed.value = "1";
  const speedLabel = document.createElement("label"); speedLabel.append(`${copy.speed} `, speed); panel.append(speedLabel);
  let mode: "orbit" | "roam" | "place" = "orbit";
  let previousMode: "orbit" | "roam" = "orbit";
  let saved: { camera: Camera; position: Vector3; quaternion: Quaternion; zoom: number; target: Vector3; fov: number; near: number } | undefined;
  const up = perspective.up.clone();
  const toY = new Quaternion().setFromUnitVectors(up, new Vector3(0, 1, 0)); const fromY = toY.clone().invert();
  let yaw = 0; let pitch = 0; let eyeHeight = Number(height.value) * (scale ?? 1);
  let point: Vector3 | undefined;
  const keys = new Set<string>(); let lastTime: number | undefined;
  let pointer: { id: number; x: number; y: number; startX: number; startY: number } | undefined;
  const marker = new Mesh(new SphereGeometry(options.radius / 120, 12, 8), new MeshBasicMaterial({ color: 0x2563eb, depthTest: false })); marker.visible = false; marker.renderOrder = 1000; options.scene.add(marker);
  const stop = () => { keys.clear(); lastTime = undefined; if (pointer && canvas.hasPointerCapture(pointer.id)) canvas.releasePointerCapture(pointer.id); pointer = undefined; };
  const orient = () => { const direction = new Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)).applyQuaternion(fromY); perspective.lookAt(perspective.position.clone().add(direction)); };
  const remember = () => {
    if (saved) return;
    const camera = options.getCamera();
    saved = { camera, position: camera.position.clone(), quaternion: camera.quaternion.clone(), zoom: camera.zoom, target: controls.target.clone(), fov: perspective.fov, near: perspective.near };
    perspective.position.copy(camera.position); perspective.quaternion.copy(camera.quaternion);
    const direction = camera.getWorldDirection(new Vector3()).applyQuaternion(toY);
    yaw = Math.atan2(-direction.x, -direction.z); pitch = Math.asin(Math.max(-0.9999, Math.min(0.9999, direction.y)));
  };
  const refreshUi = () => {
    panel.hidden = mode === "orbit"; controls.enabled = mode === "orbit";
    roam.setAttribute("aria-pressed", String(mode === "roam")); place.setAttribute("aria-pressed", String(mode === "place"));
    enter.hidden = cancel.hidden = center.hidden = mode !== "place"; enter.disabled = !point;
    movement.forEach(button => { button.hidden = mode !== "roam"; });
    help.textContent = mode === "place" ? (point ? copy.ready : copy.pick) : copy.help;
    canvas.setAttribute("aria-label", mode === "orbit" ? ui.copy.viewport : help.textContent);
    options.changed(mode !== "orbit"); schedule();
  };
  const leave = () => {
    stop(); if (!saved) return;
    perspective.fov = saved.fov; perspective.near = saved.near; perspective.updateProjectionMatrix();
    const camera = saved.camera; camera.position.copy(saved.position); camera.quaternion.copy(saved.quaternion); camera.zoom = saved.zoom; camera.updateProjectionMatrix();
    options.setCamera(camera); controls.object = camera; controls.target.copy(saved.target);
    mode = "orbit"; saved = undefined; point = undefined; marker.visible = false; controls.enabled = true; controls.update(); refreshUi(); canvas.focus();
  };
  const enterRoam = () => {
    stop(); remember(); mode = "roam"; perspective.fov = 60; perspective.zoom = 1; perspective.near = scale ? scale * 0.02 : options.radius / 10000; perspective.updateProjectionMatrix();
    options.setCamera(perspective); controls.object = perspective; orient(); marker.visible = false; point = undefined; refreshUi(); canvas.focus();
  };
  const roam = ui.button(copy.roam, () => { if (mode === "orbit") enterRoam(); else leave(); });
  const place = ui.button(copy.place, () => {
    if (mode === "place") return;
    stop(); previousMode = mode; remember(); mode = "place"; point = undefined; refreshUi(); canvas.focus();
  });
  const pick = (x: number, y: number) => {
    options.scene.updateMatrixWorld(true); const camera = options.getCamera(); camera.updateMatrixWorld(true);
    const ray = new Raycaster(); ray.setFromCamera(new Vector2(x, y), camera);
    const meshes: Object3D[] = []; options.root.traverseVisible(object => { if (object instanceof Mesh) meshes.push(object); });
    const hit = ray.intersectObjects(meshes, false).find(hit => {
      const mesh = hit.object as Mesh; const material = Array.isArray(mesh.material) ? mesh.material[hit.face?.materialIndex ?? 0] : mesh.material; return material?.visible;
    });
    if (!hit) { help.textContent = copy.miss; return; }
    point = hit.point.clone(); marker.position.copy(point).addScaledVector(up, eyeHeight); marker.visible = true; refreshUi();
  };
  const center = addButton(copy.center, () => pick(0, 0));
  const enter = addButton(copy.enter, () => { if (!point) return; perspective.position.copy(point).addScaledVector(up, eyeHeight); pitch = 0; enterRoam(); });
  const cancel = addButton(copy.cancel, () => { if (previousMode === "orbit") leave(); else { mode = "roam"; point = undefined; marker.visible = false; refreshUi(); canvas.focus(); } });
  addButton(copy.back, leave);
  const movement: HTMLButtonElement[] = [];
  const move = (dt: number) => {
    const forward = new Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)).applyQuaternion(fromY);
    const right = forward.clone().cross(up); const delta = new Vector3();
    delta.addScaledVector(forward, Number(keys.has("w")) - Number(keys.has("s")));
    delta.addScaledVector(right, Number(keys.has("d")) - Number(keys.has("a")));
    delta.addScaledVector(up, Number(keys.has("e")) - Number(keys.has("q")));
    perspective.position.addScaledVector(delta.normalize(), dt * Number(speed.value) * (scale ? scale * 1.4 : options.radius * 0.15));
    yaw += (Number(keys.has("arrowleft")) - Number(keys.has("arrowright"))) * dt;
    pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch + (Number(keys.has("arrowup")) - Number(keys.has("arrowdown"))) * dt)); orient();
  };
  [[copy.forward, "w"], [copy.backward, "s"], [copy.left, "a"], [copy.right, "d"], [copy.rise, "e"], [copy.descend, "q"]].forEach(([label, key]) => {
    // Discrete steps also make movement available to touch and assistive technology.
    movement.push(addButton(label, () => { keys.clear(); keys.add(key); move(0.25); stop(); schedule(); }));
  });
  panel.append(help);
  height.onchange = () => {
    const value = Number(height.value); if (!Number.isFinite(value) || value < 0 || height.value === "") { height.value = String(eyeHeight / (scale ?? 1)); return; }
    const next = value * (scale ?? 1);
    if (mode === "roam") perspective.position.addScaledVector(up, next - eyeHeight);
    eyeHeight = next; if (point) marker.position.copy(point).addScaledVector(up, eyeHeight); schedule();
  };
  const keydown = (event: KeyboardEvent) => {
    if (mode === "orbit" || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "Escape") { event.preventDefault(); if (mode === "place") cancel.click(); else leave(); return; }
    const key = event.key.toLowerCase();
    if (mode === "roam" && ["w", "a", "s", "d", "q", "e", "arrowleft", "arrowright", "arrowup", "arrowdown"].includes(key)) { event.preventDefault(); keys.add(key); schedule(); }
  };
  const keyup = (event: KeyboardEvent) => { keys.delete(event.key.toLowerCase()); if (!keys.size) lastTime = undefined; };
  const down = (event: PointerEvent) => { if (mode === "orbit" || event.button !== 0 || pointer) return; canvas.focus(); pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY }; canvas.setPointerCapture(event.pointerId); };
  const drag = (event: PointerEvent) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    if (mode === "roam") { yaw -= (event.clientX - pointer.x) * 0.004; pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch - (event.clientY - pointer.y) * 0.004)); orient(); schedule(); }
    pointer.x = event.clientX; pointer.y = event.clientY;
  };
  const release = (event: PointerEvent) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    if (mode === "place" && Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) < 5) { const rect = canvas.getBoundingClientRect(); pick((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2); }
    stop();
  };
  const wheel = (event: WheelEvent) => {
    // Trackpad pinch is delivered as ctrl+wheel, with smaller deltas than scrolling.
    if (mode !== "roam" || event.metaKey || event.altKey || !event.deltaY) return;
    event.preventDefault();
    const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? canvas.clientHeight : 1;
    perspective.fov = Math.max(20, Math.min(100, perspective.fov + event.deltaY * unit * (event.ctrlKey ? 0.5 : 0.05)));
    perspective.updateProjectionMatrix(); schedule();
  };
  const visibility = () => { if (document.hidden) stop(); };
  const abort = new AbortController(); const signal = abort.signal;
  canvas.addEventListener("wheel", wheel, { signal, passive: false });
  canvas.addEventListener("keydown", keydown, { signal }); window.addEventListener("keyup", keyup, { signal });
  canvas.addEventListener("blur", stop, { signal }); window.addEventListener("blur", stop, { signal }); document.addEventListener("visibilitychange", visibility, { signal });
  canvas.addEventListener("pointerdown", down, { signal }); canvas.addEventListener("pointermove", drag, { signal }); canvas.addEventListener("pointerup", release, { signal }); canvas.addEventListener("pointercancel", stop, { signal }); canvas.addEventListener("lostpointercapture", stop, { signal });
  refreshUi();
  return {
    stop,
    update(time: number) { if (mode !== "roam" || !keys.size) { lastTime = undefined; return false; } const dt = lastTime === undefined ? 0 : Math.min(0.05, (time - lastTime) / 1000); lastTime = time; move(dt); return true; },
    rebase(delta: Vector3) { if (saved) { saved.position.add(delta); saved.target.add(delta); } point?.add(delta); marker.position.add(delta); },
    dispose() { stop(); abort.abort(); marker.removeFromParent(); marker.geometry.dispose(); marker.material.dispose(); panel.remove(); roam.remove(); place.remove(); },
  };
}
