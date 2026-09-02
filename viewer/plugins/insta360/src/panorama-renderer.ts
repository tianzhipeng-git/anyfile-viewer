import { ViewerError } from "@anyfile/viewer-protocol";
import { ResourceScope } from "@anyfile/viewer-rendering";

import {
  EQUIRECTANGULAR_PROJECTION,
  X3_PHOTO_PROJECTION,
  X3_VIDEO_PROJECTION,
  type PanoramaProjectionProfile,
} from "./projection";

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
uniform float uProjectionKind;
uniform float uThetaMax;
uniform float uBlend;
uniform float uRotation;
uniform float uXi0;
uniform float uXi1;
uniform vec2 uFocal0;
uniform vec2 uFocal1;
uniform vec2 uCenter0;
uniform vec2 uCenter1;
uniform vec4 uRadial0;
uniform vec4 uRadial1;
uniform vec2 uTangential0;
uniform vec2 uTangential1;
uniform vec4 uPrism0;
uniform vec4 uPrism1;
uniform mat3 uExtrinsic0;
uniform mat3 uExtrinsic1;
uniform float uTextureRotation0;
uniform float uTextureRotation1;

vec2 lensUv(vec3 direction, vec3 forward, vec3 right, out float angle) {
  angle = acos(clamp(dot(direction, forward), -1.0, 1.0));
  float sine = sin(angle);
  vec2 radial = sine > 0.000001
    ? vec2(dot(direction, right), direction.y) / sine
    : vec2(0.0);
  float cr = cos(uRotation);
  float sr = sin(uRotation);
  radial = mat2(cr, sr, -sr, cr) * radial;
  return vec2(0.5) + vec2(1.0, -1.0) * radial * (angle / uThetaMax * 0.5);
}

vec2 rotateTexture(vec2 uv, float radians) {
  float c = cos(radians);
  float s = sin(radians);
  vec2 delta = uv - vec2(0.5);
  return vec2(0.5) + mat2(c, s, -s, c) * delta;
}

vec2 meiUv(vec3 cameraDirection, float lens, out float angle, out bool valid) {
  mat3 extrinsic = lens < 0.5 ? uExtrinsic0 : uExtrinsic1;
  vec3 local = cameraDirection * extrinsic;
  angle = acos(clamp(local.z, -1.0, 1.0));
  float xi = lens < 0.5 ? uXi0 : uXi1;
  float denominator = local.z + xi;
  vec2 point = local.xy / max(denominator, 0.000001);
  float r2 = dot(point, point);
  float r4 = r2 * r2;
  vec4 radialCoefficients = lens < 0.5 ? uRadial0 : uRadial1;
  vec2 tangential = lens < 0.5 ? uTangential0 : uTangential1;
  vec4 prism = lens < 0.5 ? uPrism0 : uPrism1;
  float radial = 1.0 + radialCoefficients.x * r2 + radialCoefficients.y * r4
    + radialCoefficients.z * r2 * r4 + radialCoefficients.w * r4 * r4;
  vec2 distorted;
  distorted.x = point.x * radial + 2.0 * tangential.x * point.x * point.y
    + tangential.y * (r2 + 2.0 * point.x * point.x) + prism.x * r2 + prism.y * r4;
  distorted.y = point.y * radial + tangential.x * (r2 + 2.0 * point.y * point.y)
    + 2.0 * tangential.y * point.x * point.y + prism.z * r2 + prism.w * r4;
  vec2 focal = lens < 0.5 ? uFocal0 : uFocal1;
  vec2 center = lens < 0.5 ? uCenter0 : uCenter1;
  float textureRotation = lens < 0.5 ? uTextureRotation0 : uTextureRotation1;
  vec2 uv = rotateTexture(focal * distorted + center, textureRotation);
  valid = denominator > 0.000001 && all(greaterThanEqual(uv, vec2(0.0))) && all(lessThanEqual(uv, vec2(1.0)));
  return uv;
}

vec2 calibratedEquidistantUv(vec3 cameraDirection, float lens, out float angle, out bool valid) {
  mat3 extrinsic = lens < 0.5 ? uExtrinsic0 : uExtrinsic1;
  vec3 local = cameraDirection * extrinsic;
  angle = acos(clamp(local.z, -1.0, 1.0));
  float sine = sin(angle);
  vec2 radial = sine > 0.000001 ? local.xy / sine : vec2(0.0);
  vec2 focal = lens < 0.5 ? uFocal0 : uFocal1;
  vec2 center = lens < 0.5 ? uCenter0 : uCenter1;
  float textureRotation = lens < 0.5 ? uTextureRotation0 : uTextureRotation1;
  vec2 uv = rotateTexture(center + focal * radial * angle, textureRotation);
  valid = all(greaterThanEqual(uv, vec2(0.0))) && all(lessThanEqual(uv, vec2(1.0)));
  return uv;
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

  if (uProjectionKind > 2.5) {
    vec2 uv = vec2(0.5 + atan(direction.x, -direction.z) / 6.28318530718,
      0.5 - asin(clamp(direction.y, -1.0, 1.0)) / 3.14159265359);
    gl_FragColor = texture2D(uTexture0, uv);
    return;
  }

  float angle0;
  float angle1;
  bool valid0;
  bool valid1;
  vec2 uv0;
  vec2 uv1;
  if (uProjectionKind > 1.5) {
    vec3 cameraDirection = vec3(direction.x, -direction.y, -direction.z);
    uv0 = calibratedEquidistantUv(cameraDirection, 0.0, angle0, valid0);
    uv1 = calibratedEquidistantUv(cameraDirection, 1.0, angle1, valid1);
  } else if (uProjectionKind > 0.5) {
    vec3 cameraDirection = vec3(direction.x, -direction.y, -direction.z);
    uv0 = meiUv(cameraDirection, 0.0, angle0, valid0);
    uv1 = meiUv(cameraDirection, 1.0, angle1, valid1);
  } else {
    uv0 = lensUv(direction, vec3(0.0, 0.0, -1.0), vec3(1.0, 0.0, 0.0), angle0);
    uv1 = lensUv(direction, vec3(0.0, 0.0, 1.0), vec3(-1.0, 0.0, 0.0), angle1);
    valid0 = angle0 <= uThetaMax;
    valid1 = angle1 <= uThetaMax;
  }
  if (!valid0 && !valid1) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  if (!valid0) { gl_FragColor = sampleLens(uv1, 1.0); return; }
  if (!valid1) { gl_FragColor = sampleLens(uv0, 0.0); return; }
  float weight0 = smoothstep(-uBlend, uBlend, angle1 - angle0);
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
  private readonly maximumTextureSize: number;
  private readonly uniforms = new Map<string, WebGLUniformLocation | null>();
  private readonly textureSizes: Array<{ width: number; height: number } | undefined> = [undefined, undefined];
  private frame?: number;
  private readonly videoFrames: Array<number | undefined> = [undefined, undefined];
  private readonly videoFrameKinds: Array<"video" | "animation" | undefined> = [undefined, undefined];
  private uploadVideoOnFrame = false;
  private video?: VideoWithFrameCallback;
  private secondVideo?: VideoWithFrameCallback;
  private layout: "dual" | "sbs" = "dual";
  private projection: PanoramaProjectionProfile = X3_PHOTO_PROJECTION;
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
    this.maximumTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;

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

  setDualSources(
    first: TexImageSource,
    second: TexImageSource,
    width: number,
    height: number,
    projection: PanoramaProjectionProfile = X3_PHOTO_PROJECTION,
  ) {
    this.ensureTextureSize(width, height);
    this.layout = "dual";
    this.projection = projection;
    this.upload(0, first, width, height);
    this.upload(1, second, width, height);
    this.schedule();
  }

  setEquirectangularSource(source: TexImageSource, width: number, height: number) {
    this.ensureTextureSize(width, height);
    this.layout = "dual";
    this.projection = EQUIRECTANGULAR_PROJECTION;
    this.upload(0, source, width, height);
    this.schedule();
  }

  setSbsVideo(video: HTMLVideoElement, width: number, height: number, projection: PanoramaProjectionProfile = X3_VIDEO_PROJECTION) {
    this.ensureTextureSize(width, height);
    this.layout = "sbs";
    this.projection = projection;
    this.video = video;
    this.bindVideoFrames(video, 0);
    this.schedule(true);
    this.startVideoFrames(0);
  }

  setDualVideos(first: HTMLVideoElement, second: HTMLVideoElement, width: number, height: number, projection: PanoramaProjectionProfile = X3_VIDEO_PROJECTION) {
    this.ensureTextureSize(width, height);
    this.layout = "dual";
    this.projection = projection;
    this.video = first;
    this.secondVideo = second;
    this.bindVideoFrames(first, 0);
    this.bindVideoFrames(second, 1);
    this.schedule(true);
    this.startVideoFrames(0);
    this.startVideoFrames(1);
  }

  setDualFrames(
    first: TexImageSource,
    second: TexImageSource,
    width: number,
    height: number,
    projection: PanoramaProjectionProfile,
  ) {
    this.ensureTextureSize(width, height);
    this.layout = "dual";
    this.projection = projection;
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
    gl.uniform1i(this.uniform("uTexture0"), 0);
    gl.uniform1i(this.uniform("uTexture1"), 1);
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
    if (allocated?.width === width && allocated.height === height) {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      this.textureSizes[index] = { width, height };
    }
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
        if (shouldUploadVideo && this.video?.readyState && this.video.videoWidth) {
          this.upload(0, this.video, this.video.videoWidth, this.video.videoHeight);
        }
        if (shouldUploadVideo && this.secondVideo?.readyState && this.secondVideo.videoWidth) {
          this.upload(1, this.secondVideo, this.secondVideo.videoWidth, this.secondVideo.videoHeight);
        }
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
    gl.uniform1f(this.uniform("uLayout"), this.layout === "sbs" ? 1 : 0);
    const equidistant = this.projection.kind === "equidistant" ? this.projection : undefined;
    const calibrated = this.projection.kind === "calibrated-equidistant" ? this.projection : undefined;
    const mei = this.projection.kind === "mei" ? this.projection : undefined;
    const projectionKind = equidistant ? 0 : mei ? 1 : this.projection.kind === "equirectangular" ? 3 : 2;
    gl.uniform1f(this.uniform("uProjectionKind"), projectionKind);
    gl.uniform1f(this.uniform("uThetaMax"), equidistant?.thetaMaxRadians ?? 0);
    gl.uniform1f(this.uniform("uBlend"), this.projection.blendRadians);
    gl.uniform1f(this.uniform("uRotation"), equidistant?.rotationRadians ?? 0);
    const calibratedLenses = calibrated?.lenses ?? mei?.lenses;
    if (calibratedLenses) {
      for (const index of [0, 1] as const) {
        const lens = calibratedLenses[index];
        gl.uniform2fv(this.uniform(`uFocal${index}`), lens.focal);
        gl.uniform2fv(this.uniform(`uCenter${index}`), lens.center);
        gl.uniformMatrix3fv(this.uniform(`uExtrinsic${index}`), false, lens.rotation);
        gl.uniform1f(this.uniform(`uTextureRotation${index}`), lens.textureRotationRadians);
        if (mei) {
          const meiLens = mei.lenses[index];
          gl.uniform1f(this.uniform(`uXi${index}`), meiLens.xi);
          gl.uniform4fv(this.uniform(`uRadial${index}`), meiLens.radial);
          gl.uniform2fv(this.uniform(`uTangential${index}`), meiLens.tangential);
          gl.uniform4fv(this.uniform(`uPrism${index}`), meiLens.prism);
        }
      }
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
