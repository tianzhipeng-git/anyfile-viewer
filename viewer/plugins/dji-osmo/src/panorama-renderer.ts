import { ResourceScope } from "@anyfile/viewer-rendering";
import { ViewerError } from "@anyfile/viewer-protocol";

import { DJI_OSMO_VIDEO_PROJECTION } from "./projection";

const VERTEX_SHADER = `
attribute vec2 aPosition;
varying vec2 vPosition;
void main() {
  vPosition = aPosition;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `
precision highp float;
uniform sampler2D uTexture0;
uniform sampler2D uTexture1;
uniform float uAspect;
uniform float uTanHalfFov;
uniform float uYaw;
uniform float uPitch;
uniform float uProjection;
uniform float uThetaMax;
uniform float uBlend;
uniform float uFocal0;
uniform float uFocal1;
uniform vec2 uCenter0;
uniform vec2 uCenter1;
uniform float uRotation0;
uniform float uRotation1;
varying vec2 vPosition;

vec2 fisheyeUv(vec3 direction, float lens, out float angle, out bool valid) {
  vec3 forward = lens < 0.5 ? vec3(0.0, 0.0, -1.0) : vec3(0.0, 0.0, 1.0);
  vec3 right = lens < 0.5 ? vec3(1.0, 0.0, 0.0) : vec3(-1.0, 0.0, 0.0);
  angle = acos(clamp(dot(direction, forward), -1.0, 1.0));
  float sine = sin(angle);
  vec2 radial = sine > 0.000001
    ? vec2(dot(direction, right), direction.y) / sine
    : vec2(0.0);
  float rotation = lens < 0.5 ? uRotation0 : uRotation1;
  float cosine = cos(rotation);
  float rotationSine = sin(rotation);
  radial = mat2(cosine, rotationSine, -rotationSine, cosine) * radial;
  float focal = lens < 0.5 ? uFocal0 : uFocal1;
  vec2 center = lens < 0.5 ? uCenter0 : uCenter1;
  vec2 uv = center + vec2(1.0, -1.0) * focal * radial * angle;
  valid = angle <= uThetaMax && all(greaterThanEqual(uv, vec2(0.0))) && all(lessThanEqual(uv, vec2(1.0)));
  return uv;
}

void main() {
  vec3 direction = normalize(vec3(vPosition.x * uAspect * uTanHalfFov, vPosition.y * uTanHalfFov, -1.0));
  float cp = cos(uPitch);
  float sp = sin(uPitch);
  direction = vec3(direction.x, cp * direction.y - sp * direction.z, sp * direction.y + cp * direction.z);
  float cy = cos(uYaw);
  float sy = sin(uYaw);
  direction = vec3(cy * direction.x + sy * direction.z, direction.y, -sy * direction.x + cy * direction.z);
  if (uProjection < 0.5) {
    vec2 uv = vec2(0.5 + atan(direction.x, -direction.z) / 6.28318530718,
      0.5 - asin(clamp(direction.y, -1.0, 1.0)) / 3.14159265359);
    gl_FragColor = texture2D(uTexture0, uv);
    return;
  }
  float angle0;
  float angle1;
  bool valid0;
  bool valid1;
  vec2 uv0 = fisheyeUv(direction, 0.0, angle0, valid0);
  vec2 uv1 = fisheyeUv(direction, 1.0, angle1, valid1);
  if (!valid0 && !valid1) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  if (!valid0) { gl_FragColor = texture2D(uTexture1, uv1); return; }
  if (!valid1) { gl_FragColor = texture2D(uTexture0, uv0); return; }
  float weight0 = smoothstep(-uBlend, uBlend, angle1 - angle0);
  gl_FragColor = mix(texture2D(uTexture1, uv1), texture2D(uTexture0, uv0), weight0);
}`;

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Unable to allocate a WebGL shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? "WebGL shader compilation failed.";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createTexture(gl: WebGLRenderingContext) {
  const texture = gl.createTexture();
  if (!texture) throw new Error("Unable to allocate a WebGL texture.");
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

export class DjiOsmoPanoramaRenderer {
  private readonly resources = new ResourceScope();
  private readonly gl: WebGLRenderingContext;
  private readonly program: WebGLProgram;
  private readonly shaders: readonly [WebGLShader, WebGLShader];
  private readonly buffer: WebGLBuffer;
  private readonly textures: readonly [WebGLTexture, WebGLTexture];
  private readonly maximumTextureSize: number;
  private readonly uniforms = new Map<string, WebGLUniformLocation | null>();
  private readonly textureSizes: Array<{ width: number; height: number } | undefined> = [undefined, undefined];
  private frame?: number;
  private projection: "equirectangular" | "fisheye" = "equirectangular";
  private yaw = 0;
  private pitch = 0;
  private fov = 75;
  private drag?: { pointerId: number; x: number; y: number };
  private disposed = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly viewport: HTMLElement,
    unsupportedMessage: string,
    private readonly resourceMessage: string,
    private readonly onFatalError: (error: ViewerError) => void,
  ) {
    const gl = canvas.getContext("webgl", { alpha: false, antialias: true });
    if (!gl) throw new ViewerError("unsupported-environment", unsupportedMessage);
    this.gl = gl;
    let vertex: WebGLShader | undefined;
    let fragment: WebGLShader | undefined;
    let program: WebGLProgram | undefined;
    let buffer: WebGLBuffer | undefined;
    let textures: [WebGLTexture, WebGLTexture] | undefined;
    try {
      vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
      fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
      program = gl.createProgram() ?? undefined;
      if (!program) throw new Error("Unable to allocate a WebGL program.");
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "WebGL link failed.");
      buffer = gl.createBuffer() ?? undefined;
      if (!buffer) throw new Error("Unable to allocate a WebGL buffer.");
      textures = [createTexture(gl), createTexture(gl)];
    } catch (error) {
      textures?.forEach((texture) => gl.deleteTexture(texture));
      if (buffer) gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
      if (fragment) gl.deleteShader(fragment);
      if (vertex) gl.deleteShader(vertex);
      throw new ViewerError("unsupported-environment", unsupportedMessage, { cause: error });
    }
    this.program = program;
    this.shaders = [vertex, fragment];
    this.buffer = buffer;
    this.textures = textures;
    this.maximumTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1i(this.uniform("uTexture0"), 0);
    gl.uniform1i(this.uniform("uTexture1"), 1);
    this.resources.listen(viewport, "wheel", (event) => this.onWheel(event as WheelEvent), { passive: false });
    this.resources.listen(viewport, "pointerdown", (event) => this.onPointerDown(event as PointerEvent));
    this.resources.listen(viewport, "pointermove", (event) => this.onPointerMove(event as PointerEvent));
    this.resources.listen(viewport, "pointerup", (event) => this.onPointerUp(event as PointerEvent));
    this.resources.listen(viewport, "pointercancel", (event) => this.onPointerUp(event as PointerEvent));
    this.resources.listen(viewport, "keydown", (event) => this.onKeyDown(event as KeyboardEvent));
    this.resources.listen(canvas, "webglcontextlost", (event) => {
      event.preventDefault();
      onFatalError(new ViewerError("unsupported-environment", unsupportedMessage));
    });
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => this.schedule());
      observer.observe(viewport);
      this.resources.add(() => observer.disconnect());
    }
  }

  get textureLimit() { return this.maximumTextureSize; }

  setEquirectangularSource(source: TexImageSource, width: number, height: number) {
    this.ensureTextureSize(width, height);
    this.projection = "equirectangular";
    this.upload(0, source, width, height);
    this.schedule();
  }

  setFisheyeFrames(first: TexImageSource, second: TexImageSource, width: number, height: number) {
    this.ensureTextureSize(width, height);
    this.projection = "fisheye";
    this.upload(0, first, width, height);
    this.upload(1, second, width, height);
    this.schedule();
  }

  reset() {
    this.yaw = 0;
    this.pitch = 0;
    this.fov = 75;
    this.schedule();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.resources.dispose();
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.gl.deleteTexture(this.textures[0]);
    this.gl.deleteTexture(this.textures[1]);
    this.gl.deleteBuffer(this.buffer);
    this.gl.deleteProgram(this.program);
    this.shaders.forEach((shader) => this.gl.deleteShader(shader));
    this.canvas.width = 0;
    this.canvas.height = 0;
  }

  private ensureTextureSize(width: number, height: number) {
    if (width > this.maximumTextureSize || height > this.maximumTextureSize) {
      throw new ViewerError("resource-limit", this.resourceMessage);
    }
  }

  private uniform(name: string) {
    if (!this.uniforms.has(name)) this.uniforms.set(name, this.gl.getUniformLocation(this.program, name));
    return this.uniforms.get(name)!;
  }

  private upload(index: 0 | 1, source: TexImageSource, width: number, height: number) {
    const gl = this.gl;
    gl.activeTexture(index === 0 ? gl.TEXTURE0 : gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.textures[index]);
    const allocated = this.textureSizes[index];
    if (allocated?.width === width && allocated.height === height) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
    else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      this.textureSizes[index] = { width, height };
    }
    const error = gl.getError();
    if (error !== gl.NO_ERROR) throw new ViewerError(error === gl.OUT_OF_MEMORY ? "resource-limit" : "open-failed", this.resourceMessage);
  }

  private schedule() {
    if (this.disposed || this.frame !== undefined) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = undefined;
      try { this.draw(); } catch (error) {
        this.onFatalError(error instanceof ViewerError ? error : new ViewerError("open-failed", this.resourceMessage, { cause: error }));
      }
    });
  }

  private draw() {
    if (this.disposed) return;
    const cssWidth = Math.max(1, this.viewport.clientWidth || 800);
    const cssHeight = Math.max(1, this.viewport.clientHeight || 600);
    const dpr = Math.min(Math.max(1, window.devicePixelRatio || 1), this.maximumTextureSize / cssWidth, this.maximumTextureSize / cssHeight);
    const width = Math.max(1, Math.round(cssWidth * dpr));
    const height = Math.max(1, Math.round(cssHeight * dpr));
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    const gl = this.gl;
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.program);
    gl.uniform1f(this.uniform("uAspect"), width / height);
    gl.uniform1f(this.uniform("uTanHalfFov"), Math.tan(this.fov * Math.PI / 360));
    gl.uniform1f(this.uniform("uYaw"), this.yaw);
    gl.uniform1f(this.uniform("uPitch"), this.pitch);
    gl.uniform1f(this.uniform("uProjection"), this.projection === "fisheye" ? 1 : 0);
    gl.uniform1f(this.uniform("uThetaMax"), DJI_OSMO_VIDEO_PROJECTION.thetaMaxRadians);
    gl.uniform1f(this.uniform("uBlend"), DJI_OSMO_VIDEO_PROJECTION.blendRadians);
    for (const index of [0, 1] as const) {
      const lens = DJI_OSMO_VIDEO_PROJECTION.lenses[index];
      gl.uniform1f(this.uniform(`uFocal${index}`), lens.focal);
      gl.uniform2f(this.uniform(`uCenter${index}`), lens.center[0], lens.center[1]);
      gl.uniform1f(this.uniform(`uRotation${index}`), lens.rotationRadians);
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private onWheel(event: WheelEvent) {
    event.preventDefault();
    this.fov = clamp(this.fov * (event.deltaY < 0 ? 0.9 : 1.1), 30, 100);
    this.schedule();
  }

  private onPointerDown(event: PointerEvent) {
    if (event.button !== 0) return;
    this.drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    this.viewport.dataset.dragging = "true";
    this.viewport.setPointerCapture?.(event.pointerId);
  }

  private onPointerMove(event: PointerEvent) {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    this.yaw += (event.clientX - this.drag.x) * 0.005;
    this.pitch = clamp(this.pitch + (event.clientY - this.drag.y) * 0.005, -Math.PI / 2, Math.PI / 2);
    this.drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    this.schedule();
  }

  private onPointerUp(event: PointerEvent) {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    this.viewport.releasePointerCapture?.(event.pointerId);
    this.drag = undefined;
    delete this.viewport.dataset.dragging;
  }

  private onKeyDown(event: KeyboardEvent) {
    const step = event.shiftKey ? 0.2 : 0.08;
    if (event.key === "ArrowLeft") this.yaw -= step;
    else if (event.key === "ArrowRight") this.yaw += step;
    else if (event.key === "ArrowUp") this.pitch = clamp(this.pitch + step, -Math.PI / 2, Math.PI / 2);
    else if (event.key === "ArrowDown") this.pitch = clamp(this.pitch - step, -Math.PI / 2, Math.PI / 2);
    else if (event.key === "+" || event.key === "=") this.fov = clamp(this.fov * 0.9, 30, 100);
    else if (event.key === "-") this.fov = clamp(this.fov * 1.1, 30, 100);
    else if (event.key === "0") this.reset();
    else return;
    event.preventDefault();
    this.schedule();
  }
}
