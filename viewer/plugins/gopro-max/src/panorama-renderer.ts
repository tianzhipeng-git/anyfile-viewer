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
uniform sampler2D uTexture0;
uniform sampler2D uTexture1;
uniform float uAspect;
uniform float uTanHalfFov;
uniform float uYaw;
uniform float uPitch;
uniform float uProjection;
uniform vec2 uTextureSize;
varying vec2 vPosition;

vec2 rotate90(vec2 uv) { return vec2(-uv.y, uv.x); }
vec2 rotate270(vec2 uv) { return vec2(uv.y, -uv.x); }

vec4 sampleTrack(float row, vec2 uv) {
  return row < 0.5 ? texture2D(uTexture0, uv) : texture2D(uTexture1, uv);
}

vec4 samplePackedFace(float face, float row, vec2 local) {
  // GoPro stores the middle face at its natural width. Each outer strip is
  // wider and contains two overlapping lens contributions around its center.
  float centerWidth = uTextureSize.y;
  float sideWidth = (uTextureSize.x - centerWidth) * 0.5;
  float overlapWidth = max(0.0, sideWidth - centerWidth);
  float y = (clamp(local.y, 0.0, 1.0) * (uTextureSize.y - 1.0) + 0.5) / uTextureSize.y;

  if (face > 0.5 && face < 1.5) {
    float x = sideWidth + clamp(local.x, 0.0, 1.0) * (centerWidth - 1.0) + 0.5;
    return sampleTrack(row, vec2(x / uTextureSize.x, y));
  }

  float start = face < 0.5 ? 0.0 : sideWidth + centerWidth;
  float overlap = overlapWidth / sideWidth;
  float leftU = (1.0 - 2.0 * overlap) * clamp(local.x, 0.0, 1.0);
  float rightU = leftU + 2.0 * overlap;
  vec2 leftUv = vec2((start + leftU * (sideWidth - 1.0) + 0.5) / uTextureSize.x, y);
  vec2 rightUv = vec2((start + rightU * (sideWidth - 1.0) + 0.5) / uTextureSize.x, y);
  if (overlapWidth < 0.5 || leftU <= 0.5 - 2.0 * overlap) return sampleTrack(row, leftUv);
  if (rightU >= 0.5 + 2.0 * overlap) return sampleTrack(row, rightUv);
  float alpha = (leftU - 0.5 + 2.0 * overlap) / (2.0 * overlap);
  return mix(sampleTrack(row, leftUv), sampleTrack(row, rightUv), alpha);
}

vec4 sampleEac(vec3 direction) {
  vec3 p = vec3(direction.x, -direction.y, -direction.z);
  vec3 magnitude = abs(p);
  float face;
  float row;
  vec2 local;
  if (magnitude.x >= magnitude.y && magnitude.x >= magnitude.z) {
    if (p.x > 0.0) {
      face = 2.0; row = 0.0; local = vec2(-p.z / p.x, p.y / p.x);
    } else {
      face = 0.0; row = 0.0; local = vec2(-p.z / p.x, -p.y / p.x);
    }
  } else if (magnitude.y >= magnitude.z) {
    if (p.y > 0.0) {
      face = 0.0; row = 1.0; local = rotate270(vec2(p.x / p.y, -p.z / p.y));
    } else {
      face = 2.0; row = 1.0; local = rotate270(vec2(-p.x / p.y, -p.z / p.y));
    }
  } else if (p.z > 0.0) {
    face = 1.0; row = 0.0; local = vec2(p.x / p.z, p.y / p.z);
  } else {
    face = 1.0; row = 1.0; local = rotate90(vec2(p.x / p.z, -p.y / p.z));
  }
  local = atan(local) * (2.0 / 3.14159265359) + 0.5;
  return samplePackedFace(face, row, local);
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
  } else {
    gl_FragColor = sampleEac(direction);
  }
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

export class GoProPanoramaRenderer {
  private readonly resources = new ResourceScope();
  private readonly gl: WebGLRenderingContext;
  private readonly program: WebGLProgram;
  private readonly shaders: readonly [WebGLShader, WebGLShader];
  private readonly buffer: WebGLBuffer;
  private readonly textures: readonly [WebGLTexture, WebGLTexture];
  private frame?: number;
  private width = 1;
  private height = 1;
  private projection: "equirectangular" | "eac" = "equirectangular";
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
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1i(gl.getUniformLocation(program, "uTexture0"), 0);
    gl.uniform1i(gl.getUniformLocation(program, "uTexture1"), 1);
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

  setEquirectangularSource(source: TexImageSource, width: number, height: number) {
    this.setSource(0, source, width, height, "equirectangular");
  }

  setEacFrames(first: TexImageSource, second: TexImageSource, width: number, height: number) {
    this.setSource(0, first, width, height, "eac");
    this.upload(1, second);
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

  private setSource(index: 0 | 1, source: TexImageSource, width: number, height: number, projection: "equirectangular" | "eac") {
    const maximum = this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number;
    if (width > maximum || height > maximum) throw new ViewerError("resource-limit", this.resourceMessage);
    this.width = width;
    this.height = height;
    this.projection = projection;
    this.upload(index, source);
    this.schedule();
  }

  private upload(index: 0 | 1, source: TexImageSource) {
    const gl = this.gl;
    gl.activeTexture(index === 0 ? gl.TEXTURE0 : gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.textures[index]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
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
    gl.uniform1f(gl.getUniformLocation(this.program, "uProjection"), this.projection === "eac" ? 1 : 0);
    gl.uniform2f(gl.getUniformLocation(this.program, "uTextureSize"), this.width, this.height);
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
