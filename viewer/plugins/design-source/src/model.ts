export type DesignFormat = "figma" | "sketch";

export type DesignColor = {
  readonly r: number; // 0..1
  readonly g: number; // 0..1
  readonly b: number; // 0..1
  readonly a: number; // 0..1
};

export type DesignGradientStop = {
  readonly position: number; // 0..1
  readonly color: DesignColor;
};

export type DesignFill =
  | {
      readonly type: "solid";
      readonly color: DesignColor;
      readonly opacity: number;
    }
  | {
      readonly type: "linear-gradient" | "radial-gradient";
      readonly stops: readonly DesignGradientStop[];
      readonly opacity: number;
    }
  | {
      readonly type: "image";
      readonly imageRef: string;
      readonly opacity: number;
    };

export type DesignStroke = {
  readonly color: DesignColor;
  readonly width: number;
  readonly opacity: number;
};

export type DesignTextInfo = {
  readonly content: string;
  readonly fontFamily?: string;
  readonly fontStyle?: string;
  readonly fontSize?: number;
  readonly lineHeight?: number;
  readonly letterSpacing?: number;
  readonly align?: "left" | "center" | "right" | "justify";
  readonly color?: DesignColor;
};

export type DesignBounds = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type DesignNodeKind =
  | "page"
  | "artboard"
  | "frame"
  | "group"
  | "rectangle"
  | "ellipse"
  | "line"
  | "vector"
  | "text"
  | "image"
  | "component"
  | "instance"
  | "other";

export type DesignPathPoint = {
  readonly x: number;
  readonly y: number;
  readonly curveFrom?: { readonly x: number; readonly y: number };
  readonly curveTo?: { readonly x: number; readonly y: number };
  readonly hasCurveFrom?: boolean;
  readonly hasCurveTo?: boolean;
};

export type DesignNode = {
  readonly id: string;
  readonly name: string;
  readonly kind: DesignNodeKind;
  readonly rawType: string;
  readonly visible: boolean;
  readonly locked?: boolean;
  readonly opacity: number;
  readonly bounds: DesignBounds;
  readonly absBounds: DesignBounds;
  readonly rotation: number;
  readonly cornerRadius: number;
  readonly clipsContent: boolean;
  readonly fills: readonly DesignFill[];
  readonly strokes: readonly DesignStroke[];
  readonly text?: DesignTextInfo;
  readonly imageRef?: string;
  readonly pathPoints?: readonly DesignPathPoint[];
  readonly pathClosed?: boolean;
  readonly children: readonly DesignNode[];
};

export type DesignPage = {
  readonly id: string;
  readonly name: string;
  readonly backgroundColor?: DesignColor;
  readonly artboards: readonly DesignNode[];
  readonly rootNodes: readonly DesignNode[];
};

export type DesignDocumentStats = {
  readonly pageCount: number;
  readonly artboardCount: number;
  readonly nodeCount: number;
  readonly textNodeCount: number;
  readonly imageCount: number;
};

export type DesignDocument = {
  readonly format: DesignFormat;
  readonly title: string;
  readonly version: string;
  readonly exportedAt?: string;
  readonly thumbnail?: Uint8Array;
  readonly pages: readonly DesignPage[];
  readonly images: ReadonlyMap<string, Uint8Array>;
  readonly fonts: readonly string[];
  readonly stats: DesignDocumentStats;
};

export function colorToCss(color: DesignColor, extraOpacity = 1): string {
  const r = Math.round(Math.min(1, Math.max(0, color.r)) * 255);
  const g = Math.round(Math.min(1, Math.max(0, color.g)) * 255);
  const b = Math.round(Math.min(1, Math.max(0, color.b)) * 255);
  const a = Math.min(1, Math.max(0, color.a * extraOpacity));
  if (a >= 0.999) {
    return `rgb(${r}, ${g}, ${b})`;
  }
  return `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(3))})`;
}

export function colorToHex(color: DesignColor): string {
  const toHex = (value: number) =>
    Math.round(Math.min(1, Math.max(0, value)) * 255)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  const base = `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
  if (color.a < 0.999) {
    return `${base}${toHex(color.a)}`;
  }
  return base;
}

export function computeContentBounds(nodes: readonly DesignNode[]): DesignBounds {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  const visit = (node: DesignNode) => {
    if (!node.visible) return;
    const { x, y, width, height } = node.absBounds;
    if (Number.isFinite(x) && Number.isFinite(y) && (width > 0 || height > 0)) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + Math.max(0, width));
      maxY = Math.max(maxY, y + Math.max(0, height));
    }
    if (node.kind === "group" || node.kind === "page") {
      for (const child of node.children) visit(child);
    }
  };

  for (const node of nodes) visit(node);

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return { x: 0, y: 0, width: 800, height: 600 };
  }
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}
