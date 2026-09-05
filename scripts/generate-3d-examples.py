from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import math
root=Path(__file__).resolve().parents[1]
vertices=[(0,0,0),(10,0,0),(0,10,0),(0,0,10)]; faces=[(0,2,1),(0,1,3),(0,3,2),(1,2,3)]
v=''.join(f'<vertex x="{x}" y="{y}" z="{z}"/>' for x,y,z in vertices); t=''.join(f'<triangle v1="{a}" v2="{b}" v3="{c}"/>' for a,b,c in faces)
model=f'<model xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" unit="millimeter"><resources><object id="1" name="Tetrahedron"><mesh><vertices>{v}</vertices><triangles>{t}</triangles></mesh></object></resources><build><item objectid="1"/></build></model>'
p=root/'viewer/plugins/print-3d/examples'
with ZipFile(p/'tetra.3mf','w',ZIP_DEFLATED) as z:
 z.writestr('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" Target="/3D/model.model"/></Relationships>')
 z.writestr('3D/model.model',model)
 z.writestr('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>')
v=''.join(f'<vertex><coordinates><x>{x}</x><y>{y}</y><z>{z}</z></coordinates></vertex>' for x,y,z in vertices); t=''.join(f'<triangle><v1>{a}</v1><v2>{b}</v2><v3>{c}</v3></triangle>' for a,b,c in faces)
(p/'tetra.amf').write_text(f'<amf unit="millimeter"><object id="1"><mesh><vertices>{v}</vertices><volume>{t}</volume></mesh></object></amf>')
p=root/'viewer/plugins/point-cloud/examples'; points=''.join(f'{math.cos(i/20):.5f} {math.sin(i/20):.5f} {i/1000:.5f}\n' for i in range(5000)); (p/'helix.xyz').write_text(points);(p/'helix.pcd').write_text('VERSION .7\nFIELDS x y z\nSIZE 4 4 4\nTYPE F F F\nCOUNT 1 1 1\nWIDTH 5000\nHEIGHT 1\nPOINTS 5000\nDATA ascii\n'+points)

# Authored LAS 1.2 format-0 helix with survey-sized offsets.
import struct
b=bytearray(227+5000*20);b[:4]=b'LASF';b[24:26]=bytes([1,2])
struct.pack_into('<HI',b,94,227,227);struct.pack_into('<H',b,105,20);struct.pack_into('<I',b,107,5000)
for axis in range(3):
 struct.pack_into('<d',b,131+8*axis,.00001);struct.pack_into('<d',b,155+8*axis,[500000,4000000,100][axis])
for i in range(5000):struct.pack_into('<iii',b,227+i*20,round(math.cos(i/20)*100000),round(math.sin(i/20)*100000),i*100)
(p/'helix.las').write_bytes(b)
