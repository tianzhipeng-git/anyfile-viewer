import { ViewerError } from "@anyfile/viewer-protocol";
import { ResourceScope } from "@anyfile/viewer-rendering";

import { X3_BLEND_RADIANS, X3_THETA_MAX_RADIANS } from "./projection";

type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?(callback: () => void): number;
  cancelVideoFrameCallback?(handle: number): void;
};

const VERTEX_SHADER = `
attribute vec2 aPosition;
varying vec2 vPosition;
void main() {
  vPosition = aPosition;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `
precision highp float;
varying vec2 vPosition;
uniform sampler2D uTexture0;
uniform sampler2D uTexture1;
uniform float uAspect;
uniform float uTanHalfFov;
uniform float uYaw;
uniform float uPitch;
uniform float uLayout;

const float THETA_MAX = ${X3_THETA_MAX_RADIANS};
const float BLEND = ${X3_BLEND_RADIANS};

vec2 lensUv(vec3 direction, vec3 forward, vec3 right, out float angle) {
  angle = acos(clamp(dot(direction, forward), -1.0, 1.0));
  float sine = sin(angle);
  vec2 radial = sine > 0.000001
    ? vec2(dot(direction, right), direction.y) / sine
    : vec2(0.0);
  return vec2(0.5) + vec2(1.0, -1.0) * radial * (angle / THETA_MAX * 0.5);
}

vec4 sampleLens(vec2 uv, float lens) {
  if (uLayout > 0.5) return texture2D(uTexture0, vec2((uv.x + lens) * 0.5, uv.y));
  return lens < 0.5 ? texture2D(uTexture0, uv) : texture2D(uTexture1, uv);
}

void main() {
  vec3 direction = normalize(vec3(vPosition.x * uAspect * uTanHalfFov, vPosition.y * uTanHalfFov, -1.0));
  float cp = cos(uPitch);
  float sp = sin(uPitch);
  direction = vec3(direction.x, cp * direction.y - sp * direction.z, sp * direction.y + cp * direction.z);
  float cy = cos(uYaw);
  float sy = sin(uYaw);
  direction = vec3(cy * direction.x + sy * direction.z, direction.y, -sy * direction.x + cy * direction.z);

  float angle0;
  float angle1;
  vec2 uv0 = lensUv(direction, vec3(0.0, 0.0, -1.0), vec3(1.0, 0.0, 0.0), angle0);
  vec2 uv1 = lensUv(direction, vec3(0.0, 0.0, 1.0), vec3(-1.0, 0.0, 0.0), angle1);
  bool valid0 = angle0 <= THETA_MAX;
  bool valid1 = angle1 <= THETA_MAX;
  if (!valid0 && !valid1) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  if (!valid0) { gl_FragColor = sampleLens(uv1, 1.0); return; }
  if (!valid1) { gl_FragColor = sampleLens(uv0, 0.0); return; }
  float weight0 = smoothstep(-BLEND, BLEND, angle1 - angle0);
  gl_FragColor = mix(sampleLens(uv1, 1.0), sampleLens(uv0, 0.0), weight0);
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

export class PanoramaRenderer {
  private readonly resources = new ResourceScope();
  private readonly gl: WebGLRenderingContext;
  private readonly program: WebGLProgram;
  private readonly vertexShader: WebGLShader;
  private readonly fragmentShader: WebGLShader;
  private readonly buffer: WebGLBuffer;
  private readonly textures: readonly [WebGLTexture, WebGLTexture];
  private frame?: number;
  private readonly videoFrames: Array<number | undefined> = [undefined, undefined];
  private readonly videoFrameKinds: Array<"video" | "animation" | undefined> = [undefined, undefined];
  private uploadVideoOnFrame = false;
  private video?: VideoWithFrameCallback;
  private secondVideo?: VideoWithFrameCallback;
  private layout: "dual" | "sbs" = "dual";
  private yaw = 0;
  private pitch = 0;
  private fov = 75;
  private drag?: { pointerId: number; x: number; y: number };
  private disposed = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly viewport: HTMLElement,
    private readonly unsupportedMessage: string,
    private readonly resourceMessage: string,
    private readonly onFatalError: (error: ViewerError) => void,
  ) {
    const gl = canvas.getContext("webgl", { alpha: false, antialias: true });
    if (!gl) throw new ViewerError("unsupported-environment", unsupportedMessage);
    this.gl = gl;
    let vertexShader: WebGLShader | undefined;
    let fragmentShader: WebGLShader | undefined;
    let program: WebGLProgram | undefined;
    let buffer: WebGLBuffer | undefined;
    let textures: [WebGLTexture, WebGLTexture] | undefined;
    try {
      vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
      fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
      program = gl.createProgram() ?? undefined;
      if (!program) throw new Error("Unable to allocate a WebGL program.");
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "WebGL program link failed.");
      buffer = gl.createBuffer() ?? undefined;
      if (!buffer) throw new Error("Unable to allocate a WebGL buffer.");
      textures = [createTexture(gl), createTexture(gl)];
    } catch (error) {
      textures?.forEach((texture) => gl.deleteTexture(texture));
      if (buffer) gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
      if (fragmentShader) gl.deleteShader(fragmentShader);
      if (vertexShader) gl.deleteShader(vertexShader);
      throw new ViewerError("unsupported-environment", unsupportedMessage, { cause: error });
    }
    this.vertexShader = vertexShader;
    this.fragmentShader = fragmentShader;
    this.program = program;
    this.buffer = buffer;
    this.textures = textures;

    this.initializeGeometry();
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

  setDualSources(first: TexImageSource, second: TexImageSource, width: number, height: number) {
    this.ensureTextureSize(width, height);
    this.layout = "dual";
    this.upload(0, first);
    this.upload(1, second);
    this.schedule();
  }

  setSbsVideo(video: HTMLVideoElement, width: number, height: number) {
    this.ensureTextureSize(width, height);
    this.layout = "sbs";
    this.video = video;
    this.bindVideoFrames(video, 0);
    this.schedule(true);
    this.startVideoFrames(0);
  }

  setDualVideos(first: HTMLVideoElement, second: HTMLVideoElement, width: number, height: number) {
    this.ensureTextureSize(width, height);
    this.layout = "dual";
    this.video = first;
    this.secondVideo = second;
    this.bindVideoFrames(first, 0);
    this.bindVideoFrames(second, 1);
    this.schedule(true);
    this.startVideoFrames(0);
    this.startVideoFrames(1);
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
    for (const index of [0, 1] as const) {
      const frame = this.videoFrames[index];
      if (frame === undefined) continue;
      const video = index === 0 ? this.video : this.secondVideo;
      if (this.videoFrameKinds[index] === "video") video?.cancelVideoFrameCallback?.(frame);
      else cancelAnimationFrame(frame);
      this.videoFrames[index] = undefined;
      this.videoFrameKinds[index] = undefined;
    }
    this.frame = undefined;
    this.gl.deleteTexture(this.textures[0]);
    this.gl.deleteTexture(this.textures[1]);
    this.gl.deleteBuffer(this.buffer);
    this.gl.deleteProgram(this.program);
    this.gl.deleteShader(this.vertexShader);
    this.gl.deleteShader(this.fragmentShader);
    this.canvas.width = 0;
    this.canvas.height = 0;
  }

  private initializeGeometry() {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(this.program, "aPosition");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1i(gl.getUniformLocation(this.program, "uTexture0"), 0);
    gl.uniform1i(gl.getUniformLocation(this.program, "uTexture1"), 1);
  }

  private ensureTextureSize(width: number, height: number) {
    const maximum = this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number;
    if (width > maximum || height > maximum) {
      throw new ViewerError("resource-limit", this.resourceMessage);
    }
  }

  private upload(index: 0 | 1, source: TexImageSource) {
    const gl = this.gl;
    gl.activeTexture(index === 0 ? gl.TEXTURE0 : gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.textures[index]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    const error = gl.getError();
    if (error !== gl.NO_ERROR) {
      throw new ViewerError(error === gl.OUT_OF_MEMORY ? "resource-limit" : "open-failed", this.resourceMessage);
    }
  }

  private schedule(uploadVideo = false) {
    if (this.disposed) return;
    this.uploadVideoOnFrame ||= uploadVideo;
    if (this.frame !== undefined) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = undefined;
      const shouldUploadVideo = this.uploadVideoOnFrame;
      this.uploadVideoOnFrame = false;
      try {
        if (shouldUploadVideo && this.video?.readyState && this.video.videoWidth) this.upload(0, this.video);
        if (shouldUploadVideo && this.secondVideo?.readyState && this.secondVideo.videoWidth) this.upload(1, this.secondVideo);
        this.draw();
      } catch (error) {
        this.onFatalError(error instanceof ViewerError ? error : new ViewerError("open-failed", this.resourceMessage, { cause: error }));
      }
    });
  }

  private bindVideoFrames(video: VideoWithFrameCallback, index: 0 | 1) {
    const redraw = () => this.schedule(true);
    this.resources.listen(video, "loadeddata", redraw);
    this.resources.listen(video, "seeked", redraw);
    this.resources.listen(video, "play", () => this.startVideoFrames(index));
    this.resources.listen(video, "pause", redraw);
    this.resources.listen(video, "ended", redraw);
  }

  private startVideoFrames(index: 0 | 1) {
    const video = index === 0 ? this.video : this.secondVideo;
    if (this.disposed || !video || video.paused || video.ended || this.videoFrames[index] !== undefined) return;
    if (video.requestVideoFrameCallback) {
      this.videoFrameKinds[index] = "video";
      this.videoFrames[index] = video.requestVideoFrameCallback(() => {
        this.videoFrames[index] = undefined;
        this.videoFrameKinds[index] = undefined;
        this.schedule(true);
        this.startVideoFrames(index);
      });
      return;
    }
    this.videoFrameKinds[index] = "animation";
    this.videoFrames[index] = requestAnimationFrame(() => {
      this.videoFrames[index] = undefined;
      this.videoFrameKinds[index] = undefined;
      this.schedule(true);
      this.startVideoFrames(index);
    });
  }

  private draw() {
    if (this.disposed) return;
    const cssWidth = Math.max(1, this.viewport.clientWidth || 800);
    const cssHeight = Math.max(1, this.viewport.clientHeight || 600);
    const maximum = this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number;
    const dpr = Math.min(Math.max(1, window.devicePixelRatio || 1), maximum / cssWidth, maximum / cssHeight);
    const width = Math.max(1, Math.round(cssWidth * dpr));
    const height = Math.max(1, Math.round(cssHeight * dpr));
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    const gl = this.gl;
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.program);
    gl.uniform1f(gl.getUniformLocation(this.program, "uAspect"), width / height);
    gl.uniform1f(gl.getUniformLocation(this.program, "uTanHalfFov"), Math.tan(this.fov * Math.PI / 360));
    gl.uniform1f(gl.getUniformLocation(this.program, "uYaw"), this.yaw);
    gl.uniform1f(gl.getUniformLocation(this.program, "uPitch"), this.pitch);
    gl.uniform1f(gl.getUniformLocation(this.program, "uLayout"), this.layout === "sbs" ? 1 : 0);
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
