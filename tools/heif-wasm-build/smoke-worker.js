import createDecoder from "/third_party/heif-wasm/1.23.2-anyfile.1/heif-decoder.js";

try {
  const decoder = await createDecoder({
    locateFile: () => "/third_party/heif-wasm/1.23.2-anyfile.1/heif-decoder.wasm",
  });
  const response = await fetch("/viewer/plugins/modern-raster/examples/sample.heic");
  const decoded = decoder.decodePrimary(new Uint8Array(await response.arrayBuffer()));
  const ok = decoded.width === 96 && decoded.height === 64 && decoded.rgba.byteLength === 96 * 64 * 4;
  postMessage({ ok, width: decoded.width, height: decoded.height, rgbaBytes: decoded.rgba.byteLength, color: decoded.color });
} catch (error) {
  postMessage({ ok: false, message: error instanceof Error ? error.message : String(error) });
}
