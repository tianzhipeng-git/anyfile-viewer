import {
  AgentError,
  ViewerError,
  abortError,
  type CaptureImageOptions,
} from "@anyfile/viewer-protocol";

import type { CadPoint, CadPrimitive, CadScene } from "./scene";

const PADDING_RATIO = 0.05;

function inkColor(color: string): string {
  return color.toLowerCase() === "#ffffff" ? "#111111" : color;
}

function selectPrimitives(scene: CadScene, target: string | undefined): readonly CadPrimitive[] {
  const trimmed = target?.trim() ?? "";
  if (!trimmed || trimmed === "fit" || trimmed === "model" || trimmed === "all") {
    const visible = scene.primitives.filter((primitive) => scene.layers[primitive.layer] !== false);
    return visible.length > 0 ? visible : scene.primitives;
  }
  if (trimmed.startsWith("layer:")) {
    const layerName = trimmed.slice("layer:".length);
    const knownLayers = new Set<string>(Object.keys(scene.layers));
    for (const primitive of scene.primitives) knownLayers.add(primitive.layer);
    if (!layerName || !knownLayers.has(layerName)) {
      throw new AgentError("target-not-found", `CAD layer target "${target}" was not found.`);
    }
    return scene.primitives.filter((primitive) => primitive.layer === layerName);
  }
  throw new AgentError(
    "target-not-found",
    `Unknown CAD target "${target}". Expected "fit" or "layer:<name>".`,
  );
}

function computeBounds(primitives: readonly CadPrimitive[], fallback: CadScene["bounds"]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const include = (point: CadPoint) => {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  };

  for (const primitive of primitives) {
    if ("points" in primitive) {
      for (const point of primitive.points) include(point);
    } else {
      include(primitive.position);
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    minX = fallback.minX;
    minY = fallback.minY;
    maxX = fallback.maxX;
    maxY = fallback.maxY;
  }

  let spanX = maxX - minX;
  let spanY = maxY - minY;
  if (spanX <= 0 && spanY <= 0) {
    minX -= 0.5;
    maxX += 0.5;
    minY -= 0.5;
    maxY += 0.5;
    spanX = 1;
    spanY = 1;
  } else if (spanX <= 0) {
    const half = spanY * 0.05;
    minX -= half;
    maxX += half;
    spanX = half * 2;
  } else if (spanY <= 0) {
    const half = spanX * 0.05;
    minY -= half;
    maxY += half;
    spanY = half * 2;
  }

  return { minX, minY, maxX, maxY, spanX, spanY };
}

export async function captureCadSceneImage(
  scene: CadScene,
  options: CaptureImageOptions,
): Promise<Blob> {
  if (options.signal?.aborted) throw abortError();
  if (!Number.isFinite(options.maxDimension) || options.maxDimension < 1) {
    throw new AgentError("invalid-argument", "maxDimension must be a positive number.");
  }

  const primitives = selectPrimitives(scene, options.target);
  const bounds = computeBounds(primitives, scene.bounds);
  const maxDim = Math.round(options.maxDimension);
  const paddedW = bounds.spanX * (1 + PADDING_RATIO * 2);
  const paddedH = bounds.spanY * (1 + PADDING_RATIO * 2);

  const width =
    paddedW >= paddedH ? maxDim : Math.max(1, Math.round(maxDim * (paddedW / paddedH)));
  const height =
    paddedH > paddedW ? maxDim : Math.max(1, Math.round(maxDim * (paddedH / paddedW)));

  const scale = Math.min(width / paddedW, height / paddedH);
  const offsetX = (width - bounds.spanX * scale) / 2;
  const offsetY = (height - bounds.spanY * scale) / 2;
  const toX = (x: number) => offsetX + (x - bounds.minX) * scale;
  const toY = (y: number) => height - offsetY - (y - bounds.minY) * scale;

  const canvas = document.createElement("canvas");
  try {
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new ViewerError("unsupported-environment", "2D canvas context is unavailable.");
    }

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(1, Math.min(2, maxDim / 800));
    const pointRadius = Math.max(1.5, maxDim / 400);

    for (const primitive of primitives) {
      const color = inkColor(primitive.color);
      if (primitive.kind === "line" || primitive.kind === "polyline") {
        if (primitive.points.length < 2) continue;
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(toX(primitive.points[0]!.x), toY(primitive.points[0]!.y));
        for (let i = 1; i < primitive.points.length; i += 1) {
          ctx.lineTo(toX(primitive.points[i]!.x), toY(primitive.points[i]!.y));
        }
        if (primitive.kind === "polyline" && primitive.closed) ctx.closePath();
        ctx.stroke();
      } else if (primitive.kind === "solid") {
        if (primitive.points.length < 3) continue;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(toX(primitive.points[0]!.x), toY(primitive.points[0]!.y));
        for (let i = 1; i < primitive.points.length; i += 1) {
          ctx.lineTo(toX(primitive.points[i]!.x), toY(primitive.points[i]!.y));
        }
        ctx.closePath();
        ctx.fill();
      } else if (primitive.kind === "point") {
        ctx.fillStyle = color;
        ctx.fillRect(
          toX(primitive.position.x) - pointRadius,
          toY(primitive.position.y) - pointRadius,
          pointRadius * 2,
          pointRadius * 2,
        );
      } else {
        const fontPx = Math.max(8, Math.min(72, primitive.height * scale));
        ctx.save();
        ctx.translate(toX(primitive.position.x), toY(primitive.position.y));
        if (primitive.rotation) ctx.rotate((-primitive.rotation * Math.PI) / 180);
        ctx.fillStyle = color;
        ctx.font = `${fontPx}px sans-serif`;
        ctx.textBaseline = "alphabetic";
        ctx.fillText(primitive.text, 0, 0);
        ctx.restore();
      }
    }

    if (options.signal?.aborted) throw abortError();
    return await new Promise<Blob>((resolve, reject) => {
      if (typeof canvas.toBlob !== "function") {
        reject(new ViewerError("unsupported-environment", "Canvas PNG export is unavailable."));
        return;
      }
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new ViewerError("open-failed", "Failed to encode rendered CAD scene as PNG."));
      }, "image/png");
    });
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}
