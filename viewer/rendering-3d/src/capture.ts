import { OrthographicCamera, type Scene, Vector3, type WebGLRenderer, WebGLRenderTarget } from "three";
import { AgentError, abortError, type CaptureImageOptions } from "@anyfile/viewer-protocol";

/** Named views for `captureImage({ target })`; the default is `iso` (`top` for planar drawings). */
const VIEWS = ["top", "front", "right", "iso"] as const;
type View = (typeof VIEWS)[number];

export interface CaptureScene {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  /** Bounding-sphere radius of the model, centred on the origin. */
  readonly radius: number;
  readonly up: "y" | "z";
  readonly planar: boolean;
}

function viewDirection(view: View, up: "y" | "z"): Vector3 {
  const directions: Record<View, [number, number, number]> = up === "z"
    ? { top: [0, 0, 1], front: [0, -1, 0], right: [1, 0, 0], iso: [1, -1, 1] }
    : { top: [0, 1, 0], front: [0, 0, 1], right: [1, 0, 0], iso: [1, 1, 1] };
  return new Vector3(...directions[view]).normalize();
}

function parseView(target: string | undefined, planar: boolean): View {
  if (target === undefined || target === "") return planar ? "top" : "iso";
  const view = target.replace(/^view:/, "") as View;
  if (!VIEWS.includes(view)) {
    throw new AgentError("target-not-found", `Unknown 3D view "${target}". Use one of: ${VIEWS.join(", ")}.`);
  }
  return view;
}

/**
 * Renders the whole model off-screen from a fitted orthographic camera into a square PNG,
 * independent of the interactive camera and viewport size.
 */
export async function captureSceneImage(capture: CaptureScene, options: CaptureImageOptions): Promise<Blob> {
  if (options.signal?.aborted) throw abortError();
  if (!Number.isFinite(options.maxDimension) || options.maxDimension < 1) {
    throw new AgentError("invalid-argument", "maxDimension must be a positive number.");
  }
  const { renderer, scene, radius } = capture;
  const view = parseView(options.target, capture.planar);
  const size = Math.max(1, Math.min(Math.round(options.maxDimension), renderer.capabilities.maxTextureSize));

  const camera = new OrthographicCamera(-radius, radius, radius, -radius, radius / 1000, radius * 1000);
  const direction = viewDirection(view, capture.up);
  camera.up.copy(capture.up === "z" ? new Vector3(0, 0, 1) : new Vector3(0, 1, 0));
  if (Math.abs(direction.dot(camera.up)) > 0.999) camera.up.set(0, capture.up === "z" ? 1 : 0, capture.up === "z" ? 0 : -1);
  camera.position.copy(direction.multiplyScalar(radius * 10));
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();

  const target = new WebGLRenderTarget(size, size, { samples: 4 });
  const pixels = new Uint8Array(size * size * 4);
  const previousTarget = renderer.getRenderTarget();
  try {
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
  } finally {
    renderer.setRenderTarget(previousTarget);
    target.dispose();
  }
  if (options.signal?.aborted) throw abortError();

  // WebGL rows are bottom-up; flip into a 2D canvas for PNG encoding.
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  try {
    const context = canvas.getContext("2d");
    if (!context) throw new AgentError("runtime-unavailable", "2D canvas is unavailable for PNG encoding.");
    const image = context.createImageData(size, size);
    const row = size * 4;
    for (let y = 0; y < size; y += 1) image.data.set(pixels.subarray((size - 1 - y) * row, (size - y) * row), y * row);
    context.putImageData(image, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new AgentError("runtime-unavailable", "Failed to encode the 3D capture as PNG."))), "image/png");
    });
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}
