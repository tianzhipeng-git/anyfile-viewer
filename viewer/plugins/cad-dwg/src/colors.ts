const basics = [0x718096, 0xff0000, 0xffff00, 0x00ff00, 0x00ffff, 0x0000ff, 0xff00ff, 0x718096, 0x808080, 0xc0c0c0];
export function aciColor(index: number): number {
  index = Math.abs(index);
  if (index < 10) return basics[index];
  if (index >= 250) { const gray = [51, 80, 105, 130, 190, 255][index-250] ?? 113; return gray*0x10101; }
  const hue = Math.floor((index-10)/10)/4;
  const value = [255, 165, 127, 76, 38][Math.floor(index%10/2)];
  const saturation = index%2 ? 0.5 : 1, c = value*saturation, x = c*(1-Math.abs(hue%2-1)), m = value-c;
  const rgb = hue < 1 ? [c,x,0] : hue < 2 ? [x,c,0] : hue < 3 ? [0,c,x] : hue < 4 ? [0,x,c] : hue < 5 ? [x,0,c] : [c,0,x];
  return rgb.reduce((result, component) => (result<<8)+Math.round(component+m), 0);
}
export function readableColor(rgb: number) { return rgb === 0xffffff || rgb === 0 ? 0x718096 : rgb; }
