export function fbxVersion(bytes: Uint8Array) {
  const text = new TextDecoder().decode(bytes);
  if (text.startsWith("Kaydara FBX Binary  \0\x1a\0")) return bytes.length >= 27 ? new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(23, true) : 0;
  return Number(/\bFBXVersion\s*:\s*(\d+)/.exec(text)?.[1] ?? 0);
}
export function isDae(source: string) {
  return /<COLLADA\b[^>]*\bxmlns\s*=\s*["']http:\/\/www\.collada\.org\/(?:2005\/11|2008\/03)\/COLLADASchema["']/.test(source);
}
