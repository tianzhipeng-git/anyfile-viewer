function clamp01(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function linearToSrgb(value: number) {
  const v = clamp01(value);
  return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
}

function css(r: number, g: number, b: number, a: number) {
  const byte = (v: number) => Math.round(clamp01(v) * 255);
  return `rgba(${byte(r)},${byte(g)},${byte(b)},${Number(clamp01(a).toFixed(4))})`;
}

/**
 * XPS colors: `#RGB`-style sRGB (`#RRGGBB`, `#AARRGGBB`), scRGB `sc#[a,]r,g,b`, and
 * `ContextColor profile a,c1…` (approximated without ICC: gray, RGB or naive CMYK).
 */
export function parseColor(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const text = value.trim();
  const hex = /^#([0-9a-f]{6}|[0-9a-f]{8})$/i.exec(text);
  if (hex) {
    const digits = hex[1]!;
    const n = (offset: number) => Number.parseInt(digits.slice(offset, offset + 2), 16) / 255;
    return digits.length === 8 ? css(n(2), n(4), n(6), n(0)) : css(n(0), n(2), n(4), 1);
  }
  if (/^sc#/i.test(text)) {
    const parts = text.slice(3).split(/[\s,]+/).filter(Boolean).map(Number);
    if (parts.length !== 3 && parts.length !== 4) return undefined;
    const [a, r, g, b] = parts.length === 4 ? parts : [1, ...parts];
    return css(linearToSrgb(r!), linearToSrgb(g!), linearToSrgb(b!), a!);
  }
  const context = /^ContextColor\s+\S+\s+(.+)$/i.exec(text);
  if (context) {
    const [a = 1, ...channels] = context[1]!.split(/[\s,]+/).filter(Boolean).map(Number);
    if (channels.length === 1) return css(channels[0]!, channels[0]!, channels[0]!, a);
    if (channels.length === 3) return css(channels[0]!, channels[1]!, channels[2]!, a);
    if (channels.length >= 4) {
      const [c, m, y, k] = channels.map(clamp01) as [number, number, number, number];
      return css((1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k), a);
    }
  }
  return undefined;
}
