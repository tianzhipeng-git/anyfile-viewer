import { strToU8, zipSync } from "fflate";

const NS = {
  xps: "http://schemas.microsoft.com/xps/2005/06",
  oxps: "http://schemas.openxps.org/oxps/v1.0",
};
const KEY_NS = "http://schemas.microsoft.com/xps/2005/06/resourcedictionary-key";

export interface BuildOptions {
  readonly openXps?: boolean;
  /** Store page 2 as interleaved `[n].piece` parts. */
  readonly pieces?: boolean;
  /** Replace (string) or drop (null) individual parts. */
  readonly overrides?: Record<string, string | null>;
  readonly name?: string;
}

/** Synthetic XPS/OpenXPS package exercising features the real samples do not contain. */
export function buildXps(options: BuildOptions = {}) {
  const ns = options.openXps ? NS.oxps : NS.xps;
  const relBase = options.openXps ? "http://schemas.openxps.org/oxps/v1.0" : NS.xps;
  const page2 = `<FixedPage xmlns="${ns}" Width="300" Height="150"><Glyphs FontUri="/Resources/missing.ttf" FontRenderingEmSize="12" OriginX="5" OriginY="20" UnicodeString="Second page" Fill="#FF000000"/></FixedPage>`;
  const parts: Record<string, string | null> = {
    "[Content_Types].xml": `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="fpage" ContentType="application/vnd.ms-package.xps-fixedpage+xml"/></Types>`,
    "_rels/.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="${relBase}/fixedrepresentation" Target="/Doc.fdseq"/></Relationships>`,
    "Doc.fdseq": `<FixedDocumentSequence xmlns="${ns}"><DocumentReference Source="Documents/1/Doc.fdoc"/></FixedDocumentSequence>`,
    "Documents/1/Doc.fdoc": `<FixedDocument xmlns="${ns}"><PageContent Source="Pages/1.fpage" Width="200" Height="100"><PageContent.LinkTargets><LinkTarget Name="intro"/></PageContent.LinkTargets></PageContent><PageContent Source="Pages/2.fpage"/></FixedDocument>`,
    "Documents/1/_rels/Doc.fdoc.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="s" Type="${relBase}/documentstructure" Target="Structure/Doc.struct"/></Relationships>`,
    "Documents/1/Structure/Doc.struct": `<DocumentStructure xmlns="${ns}/documentstructure"><DocumentStructure.Outline><DocumentOutline><OutlineEntry OutlineLevel="1" OutlineTarget="../Doc.fdoc#intro" Description="Intro"/><OutlineEntry OutlineLevel="2" OutlineTarget="../Pages/2.fpage" Description="Details"/><OutlineEntry OutlineLevel="1" OutlineTarget="../Pages/9.fpage" Description="Dangling"/></DocumentOutline></DocumentStructure.Outline></DocumentStructure>`,
    "Resources/shared.dict": `<ResourceDictionary xmlns="${ns}" xmlns:x="${KEY_NS}"><LinearGradientBrush x:Key="grad" MappingMode="Absolute" StartPoint="0,0" EndPoint="10,0"><LinearGradientBrush.GradientStops><GradientStop Offset="1" Color="#800000FF"/><GradientStop Offset="0" Color="#FFFF0000"/></LinearGradientBrush.GradientStops></LinearGradientBrush><PathGeometry x:Key="arc" FillRule="NonZero" Transform="2,0,0,2,0,0"><PathFigure StartPoint="0,0" IsClosed="true"><ArcSegment Point="10,0" Size="5,5" SweepDirection="Clockwise" IsLargeArc="false" RotationAngle="0"/></PathFigure></PathGeometry></ResourceDictionary>`,
    "Documents/1/Pages/1.fpage": `<FixedPage xmlns="${ns}" Width="200" Height="100"><FixedPage.Resources><ResourceDictionary Source="../../../Resources/shared.dict"/></FixedPage.Resources><Path Data="M0,0 L10,0 10,10Z" Fill="{StaticResource grad}"/><Canvas Opacity="0.5" RenderTransform="1,0,0,1,10,20"><Path Data="{StaticResource arc}" Fill="#FF00FF00" Stroke="#FF000000" StrokeThickness="2" StrokeDashArray="1 1"/></Canvas><Glyphs FontUri="/Resources/missing.ttf" FontRenderingEmSize="10" OriginX="5" OriginY="90" UnicodeString="Hello XPS" Fill="#FF000000"/></FixedPage>`,
  };
  if (options.pieces) {
    const middle = Math.floor(page2.length / 2);
    parts["Documents/1/Pages/2.fpage/[0].piece"] = page2.slice(0, middle);
    parts["Documents/1/Pages/2.fpage/[1].last.piece"] = page2.slice(middle);
  } else {
    parts["Documents/1/Pages/2.fpage"] = page2;
  }
  Object.assign(parts, options.overrides);
  const entries: Record<string, Uint8Array> = {};
  for (const [name, content] of Object.entries(parts)) if (content !== null) entries[name] = strToU8(content);
  const bytes = zipSync(entries, { level: 6 });
  return new File([bytes.slice().buffer as ArrayBuffer], options.name ?? (options.openXps ? "sample.oxps" : "sample.xps"));
}
