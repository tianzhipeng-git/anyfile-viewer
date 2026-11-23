import { dirOf, joinLoc, type OfdPackage } from "./package";
import { boolAttr, child, childText, children, numberAttr, numbers, parseXml } from "./xml";

export interface FontDef {
  readonly name: string;
  readonly family: string;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly serif: boolean;
  readonly fixedWidth: boolean;
  /** Embedded font file package path. */
  readonly file?: string;
}

export interface ColorSpaceDef {
  readonly type: "RGB" | "GRAY" | "CMYK";
  readonly bits: number;
  readonly palette: readonly (readonly number[])[];
}

export interface DrawParamDef {
  readonly relative?: string;
  readonly lineWidth?: number;
  readonly join?: string;
  readonly cap?: string;
  readonly miterLimit?: number;
  readonly dashOffset?: number;
  readonly dashPattern?: readonly number[];
  readonly fillColor?: Element;
  readonly strokeColor?: Element;
}

export interface CompositeDef {
  readonly width: number;
  readonly height: number;
  readonly content: Element;
}

export interface MediaDef {
  readonly part?: string;
  readonly format: string;
}

type Kind = "fonts" | "colorSpaces" | "drawParams" | "composites" | "media";
interface Defs {
  fonts: FontDef;
  colorSpaces: ColorSpaceDef;
  drawParams: DrawParamDef;
  composites: CompositeDef;
  media: MediaDef;
}

/** Resource definitions by ID; page tables fall back to the document table. */
export class ResourceTable {
  private readonly maps: { [K in Kind]: Map<string, Defs[K]> } = {
    fonts: new Map(),
    colorSpaces: new Map(),
    drawParams: new Map(),
    composites: new Map(),
    media: new Map(),
  };

  constructor(private readonly parent?: ResourceTable) {}

  get<K extends Kind>(kind: K, id: string | null | undefined): Defs[K] | undefined {
    if (!id) return undefined;
    return (this.maps[kind] as Map<string, Defs[K]>).get(id.trim()) ?? this.parent?.get(kind, id);
  }

  set<K extends Kind>(kind: K, id: string | null, value: Defs[K]) {
    if (id) (this.maps[kind] as Map<string, Defs[K]>).set(id.trim(), value);
  }
}

function colorSpaceType(value: string | null): ColorSpaceDef["type"] {
  const upper = value?.toUpperCase();
  return upper === "GRAY" || upper === "CMYK" ? upper : "RGB";
}

/** Reads one `Res` part (PublicRes, DocumentRes or PageRes) into `table`. */
export async function loadResources(pkg: OfdPackage, resPath: string, table: ResourceTable) {
  const root = parseXml(await pkg.text(resPath));
  const resDir = dirOf(resPath);
  const baseDir = joinLoc(resDir, root.getAttribute("BaseLoc") ?? "") + "/";
  const file = (loc: string | undefined) =>
    loc ? (pkg.resolve(baseDir, loc) ?? pkg.resolve(resDir, loc)) : undefined;

  for (const group of Array.from(root.children)) {
    for (const item of Array.from(group.children)) {
      const id = item.getAttribute("ID");
      switch (item.localName) {
        case "Font":
          table.set("fonts", id, {
            name: item.getAttribute("FontName") ?? "",
            family: item.getAttribute("FamilyName") ?? "",
            bold: boolAttr(item, "Bold") ?? false,
            italic: boolAttr(item, "Italic") ?? false,
            serif: boolAttr(item, "Serif") ?? false,
            fixedWidth: boolAttr(item, "FixedWidth") ?? false,
            file: file(childText(item, "FontFile")),
          });
          break;
        case "ColorSpace":
          table.set("colorSpaces", id, {
            type: colorSpaceType(item.getAttribute("Type")),
            bits: numberAttr(item, "BitsPerComponent") ?? 8,
            palette: children(child(item, "Palette") ?? item, "CV").map((cv) => numbers(cv.textContent)),
          });
          break;
        case "DrawParam": {
          const dash = numbers(item.getAttribute("DashPattern"));
          table.set("drawParams", id, {
            relative: item.getAttribute("Relative") ?? undefined,
            lineWidth: numberAttr(item, "LineWidth"),
            join: item.getAttribute("Join") ?? undefined,
            cap: item.getAttribute("Cap") ?? undefined,
            miterLimit: numberAttr(item, "MiterLimit"),
            dashOffset: numberAttr(item, "DashOffset"),
            dashPattern: dash.length ? dash : undefined,
            fillColor: child(item, "FillColor"),
            strokeColor: child(item, "StrokeColor"),
          });
          break;
        }
        case "CompositeGraphicUnit": {
          const content = child(item, "Content");
          if (content) {
            table.set("composites", id, {
              width: numberAttr(item, "Width") ?? 0,
              height: numberAttr(item, "Height") ?? 0,
              content,
            });
          }
          break;
        }
        case "MultiMedia":
          table.set("media", id, {
            part: file(childText(item, "MediaFile")),
            format: (item.getAttribute("Format") ?? "").toUpperCase(),
          });
          break;
      }
    }
  }
}
