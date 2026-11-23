import { strToU8, zipSync } from "fflate";

const NS = 'xmlns:ofd="http://www.ofdspec.org/2016"';

export interface BuildOptions {
  /** Replace (string) or drop (null) individual parts. */
  readonly overrides?: Record<string, string | null>;
  readonly name?: string;
}

export const SYNTHETIC_PAGE = `<?xml version="1.0"?><ofd:Page ${NS}><ofd:Area><ofd:PhysicalBox>0 0 100 50</ofd:PhysicalBox></ofd:Area><ofd:Content><ofd:Layer DrawParam="11">
<ofd:PathObject ID="20" Boundary="10 10 20 20" Fill="true" Stroke="false"><ofd:FillColor><ofd:AxialShd StartPoint="0 0" EndPoint="20 0"><ofd:Segment Position="0"><ofd:Color Value="255 0 0"/></ofd:Segment><ofd:Segment Position="1"><ofd:Color Value="0 0 255"/></ofd:Segment></ofd:AxialShd></ofd:FillColor><ofd:AbbreviatedData>S 0 0 L 20 0 B 20 10 10 20 0 20 C</ofd:AbbreviatedData></ofd:PathObject>
<ofd:PathObject ID="21" Boundary="0 0 100 50"><ofd:Clips><ofd:Clip><ofd:Area><ofd:Path Boundary="5 5 10 10"><ofd:AbbreviatedData>M 0 0 L 10 0 L 10 10 C</ofd:AbbreviatedData></ofd:Path></ofd:Area></ofd:Clip></ofd:Clips><ofd:AbbreviatedData>M 0 0 L 100 50</ofd:AbbreviatedData></ofd:PathObject>
<ofd:TextObject ID="22" Boundary="0 30 100 10" Font="3" Size="5" Weight="700" Alpha="128"><ofd:CGTransform CodePosition="1" CodeCount="2" GlyphCount="1"><ofd:Glyphs>42</ofd:Glyphs></ofd:CGTransform><ofd:TextCode X="1" Y="4" DeltaX="g 2 3"><![CDATA[a<fi]]></ofd:TextCode></ofd:TextObject>
<ofd:PageBlock ID="23"><ofd:CompositeObject ID="24" Boundary="50 0 10 10" ResourceID="5"/></ofd:PageBlock>
</ofd:Layer></ofd:Content></ofd:Page>`;

/** Synthetic single-document OFD exercising features the real samples do not isolate. */
export function buildOfd(options: BuildOptions = {}) {
  const parts: Record<string, string | null> = {
    "OFD.xml": `<?xml version="1.0"?><ofd:OFD ${NS} DocType="OFD" Version="1.1"><ofd:DocBody><ofd:DocRoot>Doc_0/Document.xml</ofd:DocRoot></ofd:DocBody></ofd:OFD>`,
    "Doc_0/Document.xml": `<?xml version="1.0"?><ofd:Document ${NS}><ofd:CommonData><ofd:PageArea><ofd:PhysicalBox>0 0 210 297</ofd:PhysicalBox></ofd:PageArea><ofd:PublicRes>PublicRes.xml</ofd:PublicRes></ofd:CommonData><ofd:Pages><ofd:Page ID="1" BaseLoc="Pages/Page_0/Content.xml"/><ofd:Page ID="2" BaseLoc="Pages/Page_1/Content.xml"/></ofd:Pages><ofd:Outlines><ofd:OutlineElem Title="Cover"><ofd:Actions><ofd:Action Event="CLICK"><ofd:Goto><ofd:Dest Type="XYZ" PageID="1"/></ofd:Goto></ofd:Action></ofd:Actions><ofd:OutlineElem Title="Body"><ofd:Actions><ofd:Action Event="CLICK"><ofd:Goto><ofd:Dest Type="XYZ" PageID="2"/></ofd:Goto></ofd:Action></ofd:Actions></ofd:OutlineElem></ofd:OutlineElem></ofd:Outlines></ofd:Document>`,
    "Doc_0/PublicRes.xml": `<?xml version="1.0"?><ofd:Res ${NS} BaseLoc="Res"><ofd:ColorSpaces><ofd:ColorSpace ID="9" Type="GRAY" BitsPerComponent="8"/></ofd:ColorSpaces><ofd:DrawParams><ofd:DrawParam ID="10" LineWidth="2"><ofd:StrokeColor Value="0 128 0"/></ofd:DrawParam><ofd:DrawParam ID="11" Relative="10" Cap="Round"/></ofd:DrawParams><ofd:Fonts><ofd:Font ID="3" FontName="宋体" FamilyName="SimSun"/></ofd:Fonts><ofd:CompositeGraphicUnits><ofd:CompositeGraphicUnit ID="5" Width="10" Height="10"><ofd:Content><ofd:PathObject ID="30" Boundary="0 0 10 10"><ofd:StrokeColor Value="128" ColorSpace="9"/><ofd:AbbreviatedData>M 0 0 L 10 10</ofd:AbbreviatedData></ofd:PathObject></ofd:Content></ofd:CompositeGraphicUnit></ofd:CompositeGraphicUnits></ofd:Res>`,
    "Doc_0/Pages/Page_0/Content.xml": SYNTHETIC_PAGE,
    "Doc_0/Pages/Page_1/Content.xml": `<?xml version="1.0"?><ofd:Page ${NS}><ofd:Content><ofd:Layer><ofd:TextObject ID="40" Boundary="0 0 100 10" Font="3" Size="4"><ofd:TextCode X="0" Y="4">Second page</ofd:TextCode></ofd:TextObject></ofd:Layer></ofd:Content></ofd:Page>`,
  };
  Object.assign(parts, options.overrides);
  const entries: Record<string, Uint8Array> = {};
  for (const [name, content] of Object.entries(parts)) if (content !== null) entries[name] = strToU8(content);
  const bytes = zipSync(entries, { level: 6 });
  return new File([bytes.slice().buffer as ArrayBuffer], options.name ?? "sample.ofd");
}
