import { ResourceScope } from "@anyfile/viewer-rendering";
import { ViewerError } from "@anyfile/viewer-protocol";

const VERTEX_SHADER = `
attribute vec2 aPosition;
varying vec2 vPosition;
void main() {
  vPosition = aPosition;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `
precision highp float;
uniform sampler2D uTexture;
uniform float uAspect;
uniform float uTanHalfFov;
uniform float uYaw;
uniform float uPitch;
varying vec2 vPosition;

void main() {
  vec3 dir = normalize(vec3(vPosition.x * uAspect * uTanHalfFov, vPosition.y * uTanHalfFov, -1.0));
  float cp = cos(uPitch);
  float sp = sin(uPitch);
  dir = vec3(dir.x, cp * dir.y - sp * dir.z, sp * dir.y + cp * dir.z);
  float cy = cos(uYaw);
  float sy = sin(uYaw);
  dir = vec3(cy * dir.x + sy * dir.z, dir.y, -sy * dir.x + cy * dir.z);
  vec2 uv = vec2(
    0.5 + atan(dir.x, -dir.z) / 6.28318530718,
    0.5 - asin(clamp(dir.y, -1.0, 1.0)) / 3.14159265359
  );
  gl_FragColor = texture2D(uTexture, uv);
}`;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new ViewerError("unsupported-environment", "Unable to allocate WebGL shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader) ?? "WebGL shader compilation failed.";
    gl.deleteShader(shader);
    throw new ViewerError("unsupported-environment", info);
  }
  return shader;
}

export class HdriSphereViewport {
  private readonly resources = new ResourceScope();
  private readonly gl: WebGLRenderingContext;
  private readonly program: WebGLProgram;
  private readonly shaders: readonly [WebGLShader, WebGLShader];
  private readonly buffer: WebGLBuffer;
  private readonly texture: WebGLTexture;
  private readonly maxTextureSize: number;
  private readonly uniforms: Record<string, WebGLUniformLocation | null>;
  private frame?: number;
  private yaw = 0;
  private pitch = 0;
  private fov = 75;
  private drag?: { pointerId: number; x: number; y: number };
  private disposed = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly viewport: HTMLElement,
    private readonly onFovChange: (fov: number) => void,
  ) {
    const gl = canvas.getContext("webgl", { antialias: true, alpha: false });
    if (!gl) {
      throw new ViewerError("unsupported-environment", "WebGL is unavailable for 360° HDRI sphere preview.");
    }
    this.gl = gl;
    this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;

    const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    this.shaders = [vs, fs];
    const program = gl.createProgram();
    if (!program) throw new ViewerError("unsupported-environment", "Unable to allocate WebGL program.");
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new ViewerError("unsupported-environment", gl.getProgramInfoLog(program) ?? "WebGL link failed.");
    }
    this.program = program;

    const buffer = gl.createBuffer();
    if (!buffer) throw new ViewerError("unsupported-environment", "Unable to allocate WebGL vertex buffer.");
    this.buffer = buffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    const texture = gl.createTexture();
    if (!texture) throw new ViewerError("unsupported-environment", "Unable to allocate WebGL texture.");
    this.texture = texture;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.uniforms = {
      uTexture: gl.getUniformLocation(program, "uTexture"),
      uAspect: gl.getUniformLocation(program, "uAspect"),
      uTanHalfFov: gl.getUniformLocation(program, "uTanHalfFov"),
      uYaw: gl.getUniformLocation(program, "uYaw"),
      uPitch: gl.getUniformLocation(program, "uPitch"),
    };

    this.resources.listen(viewport, "pointerdown", (e) => this.onPointerDown(e as PointerEvent));
    this.resources.listen(viewport, "pointermove", (e) => this.onPointerMove(e as PointerEvent));
    this.resources.listen(viewport, "pointerup", (e) => this.onPointerUp(e as PointerEvent));
    this.resources.listen(viewport, "pointercancel", (e) => this.onPointerUp(e as PointerEvent));
    this.resources.listen(viewport, "wheel", (e) => this.onWheel(e as WheelEvent), { passive: false });
    this.resources.listen(viewport, "keydown", (e) => this.onKeyDown(e as KeyboardEvent));

    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => this.schedule());
      ro.observe(viewport);
      this.resources.add(() => ro.disconnect());
    }
    this.onFovChange(this.fov);
  }

  uploadCanvas(source: HTMLCanvasElement): void {
    if (this.disposed) return;
    const gl = this.gl;
    let uploadSource: HTMLCanvasElement = source;
    if (source.width > this.maxTextureSize || source.height > this.maxTextureSize) {
      const scale = Math.min(this.maxTextureSize / source.width, this.maxTextureSize / source.height);
      const scaled = document.createElement("canvas");
      scaled.width = Math.max(1, Math.floor(source.width * scale));
      scaled.height = Math.max(1, Math.floor(source.height * scale));
      scaled.getContext("2d")?.drawImage(source, 0, 0, scaled.width, scaled.height);
      uploadSource = scaled;
    }
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    // NPOT textures in WebGL1 require CLAMP_TO_EDGE on both axes
    const isPot = (n: number) => (n & (n - 1)) === 0;
    const wrapS = isPot(uploadSource.width) && isPot(uploadSource.height) ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, uploadSource);
    this.schedule();
  }

  resetCamera(): void {
    this.yaw = 0;
    this.pitch = 0;
    this.fov = 75;
    this.onFovChange(this.fov);
    this.schedule();
  }

  schedule(): void {
    if (this.disposed || this.frame !== undefined) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = undefined;
      this.render();
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resources.dispose();
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = undefined;
    const gl = this.gl;
    gl.deleteTexture(this.texture);
    gl.deleteBuffer(this.buffer);
    gl.deleteProgram(this.program);
    gl.deleteShader(this.shaders[0]);
    gl.deleteShader(this.shaders[1]);
    this.canvas.width = 0;
    this.canvas.height = 0;
  }

  private render(): void {
    if (this.disposed) return;
    const width = this.viewport.clientWidth || 800;
    const height = this.viewport.clientHeight || 600;
    const dpr = Math.min(Math.max(1, window.devicePixelRatio || 1), 2);
    const pw = Math.max(1, Math.round(width * dpr));
    const ph = Math.max(1, Math.round(height * dpr));
    if (this.canvas.width !== pw) this.canvas.width = pw;
    if (this.canvas.height !== ph) this.canvas.height = ph;

    const gl = this.gl;
    gl.viewport(0, 0, pw, ph);
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    const posLoc = gl.getAttribLocation(this.program, "aPosition");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(this.uniforms.uTexture, 0);
    gl.uniform1f(this.uniforms.uAspect, width / Math.max(1, height));
    gl.uniform1f(this.uniforms.uTanHalfFov, Math.tan((this.fov * Math.PI) / 360));
    gl.uniform1f(this.uniforms.uYaw, this.yaw);
    gl.uniform1f(this.uniforms.uPitch, this.pitch);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    this.drag = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
    this.viewport.dataset.dragging = "true";
    this.viewport.setPointerCapture?.(e.pointerId);
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.drag || e.pointerId !== this.drag.pointerId) return;
    const dx = e.clientX - this.drag.x;
    const dy = e.clientY - this.drag.y;
    this.drag = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
    const sensitivity = (this.fov / 75) * 0.005;
    this.yaw -= dx * sensitivity;
    this.pitch = clamp(this.pitch + dy * sensitivity, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
    this.schedule();
  }

  private onPointerUp(e: PointerEvent): void {
    if (!this.drag || e.pointerId !== this.drag.pointerId) return;
    this.viewport.releasePointerCapture?.(e.pointerId);
    this.drag = undefined;
    delete this.viewport.dataset.dragging;
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    this.fov = clamp(this.fov + (e.deltaY > 0 ? 5 : -5), 25, 120);
    this.onFovChange(this.fov);
    this.schedule();
  }

  private onKeyDown(e: KeyboardEvent): void {
    const step = 0.1;
    if (e.key === "ArrowLeft") this.yaw -= step;
    else if (e.key === "ArrowRight") this.yaw += step;
    else if (e.key === "ArrowUp") this.pitch = clamp(this.pitch + step, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
    else if (e.key === "ArrowDown") this.pitch = clamp(this.pitch - step, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
    else if (e.key === "0") {
      this.resetCamera();
      e.preventDefault();
      return;
    } else return;
    e.preventDefault();
    this.schedule();
  }
}
