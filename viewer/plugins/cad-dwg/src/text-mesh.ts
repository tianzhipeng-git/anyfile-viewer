import { BufferAttribute, BufferGeometry, CanvasTexture, DoubleSide, Group, Mesh, MeshBasicMaterial, SRGBColorSpace, Vector3 } from "three";
import type { DrawingText } from "./types";

// Fixed-size atlases cap texture memory and keep text in its drawing plane, including mirrored/scaled blocks.
export function appendText(texts: DrawingText[], layers: Map<string, Group>) {
  const size = 2048, font = 32, lineHeight = 40;
  const owned: MeshBasicMaterial[] = [];
  let page = 0, x = 2, y = 2, rowHeight = 0;
  let canvas: HTMLCanvasElement, ctx!: CanvasRenderingContext2D, material!: MeshBasicMaterial;
  const newPage = () => {
    if (++page > 8) throw new RangeError("DWG text atlas budget");
    canvas = document.createElement("canvas"); canvas.width = canvas.height = size;
    const context = canvas.getContext("2d"); if (!context) throw new Error("Canvas unavailable"); ctx = context;
    ctx.font = `${font}px sans-serif`; ctx.textBaseline = "top"; ctx.fillStyle = "white";
    const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace; texture.generateMipmaps = false;
    material = new MeshBasicMaterial({ map: texture, transparent: true, alphaTest: 0.02, side: DoubleSide, depthWrite: false, vertexColors: true });
    owned.push(material); x = y = 2; rowHeight = 0;
  };
  if (!texts.length) return;
  try {
  newPage();
  const groups = new Map<string, { positions: number[]; uvs: number[]; colors: number[]; material: MeshBasicMaterial; layer: string }>();
  for (const text of texts) {
    const lines: string[] = [];
    const maxWidth = Math.min(size-8, (text.width && text.width > 0 ? text.width : 60)*font);
    for (const paragraph of text.text.split("\n")) {
      let line = "";
      for (const char of paragraph) {
        if (line && ctx.measureText(line+char).width > maxWidth) { lines.push(line); line = ""; }
        line += char;
      }
      lines.push(line);
    }
    const width = Math.max(1, ...lines.map(line => ctx.measureText(line).width)), height = lines.length*lineHeight;
    if (height > size-4) throw new RangeError("DWG text height budget");
    if (x+width+2 > size) { x = 2; y += rowHeight+2; rowHeight = 0; }
    if (y+height+2 > size) newPage();
    lines.forEach((line, i) => ctx.fillText(line, x, y+i*lineHeight));
    material.map!.needsUpdate = true;
    const key = `${page}\0${text.layer}`;
    let group = groups.get(key);
    if (!group) { group = { positions: [], uvs: [], colors: [], material, layer: text.layer }; groups.set(key, group); }
    const w = width/font, h = height/font;
    const left = -text.alignX*w, bottom = -text.alignY*h;
    const anchor = new Vector3(...text.position), dx = new Vector3(...text.xAxis), dy = new Vector3(...text.yAxis);
    const corners = [[left,bottom], [left+w,bottom], [left+w,bottom+h], [left,bottom+h]];
    const uv = [[x/size,1-(y+height)/size],[(x+width)/size,1-(y+height)/size],[(x+width)/size,1-y/size],[x/size,1-y/size]];
    for (const i of [0,1,2,0,2,3]) {
      group.positions.push(...anchor.clone().addScaledVector(dx,corners[i][0]).addScaledVector(dy,corners[i][1]).toArray());
      group.uvs.push(...uv[i]);
      // Three.js material colors are linear; CAD RGB values are sRGB.
      const rgb = text.color;
      for (const shift of [16,8,0]) { const c = ((rgb >> shift)&255)/255; group.colors.push(c <= 0.04045 ? c/12.92 : ((c+0.055)/1.055)**2.4); }
    }
    x += Math.ceil(width)+2; rowHeight = Math.max(rowHeight,height);
  }
  for (const group of groups.values()) {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position",new BufferAttribute(new Float32Array(group.positions),3));
    geometry.setAttribute("uv",new BufferAttribute(new Float32Array(group.uvs),2));
    geometry.setAttribute("color",new BufferAttribute(new Float32Array(group.colors),3));
    const mesh = new Mesh(geometry,group.material); mesh.renderOrder = 2;
    layers.get(group.layer)!.add(mesh);
  }
  } catch (error) { for (const material of owned) { material.map?.dispose(); material.dispose(); } throw error; }
}
