"""Original minimal room fixtures, Apache-2.0 (repository license)."""
from pathlib import Path
import struct, zlib, base64
root=Path(__file__).parent
def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data))
png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',1,1,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(b'\0\x80\xb0\xe0\xff'))+chunk(b'IEND',b'')
(root/'surface.png').write_bytes(png)
faces=[(0,2,1),(0,3,2),(4,5,6),(4,6,7),(0,1,5),(0,5,4),(1,2,6),(1,6,5),(2,3,7),(2,7,6),(3,0,4),(3,4,7)]
parts=[('Floor',0,0,0,600,400,20),('North',0,190,20,600,20,300),('South',0,-190,20,600,20,300),('East',290,0,20,20,360,300),('West',-290,0,20,20,360,300)]
def vertices(w,d,h):return [-w/2,-d/2,0,w/2,-d/2,0,w/2,d/2,0,-w/2,d/2,0,-w/2,-d/2,h,w/2,-d/2,h,w/2,d/2,h,-w/2,d/2,h]
def node(name,props=[],children=[]):return (name,props,children)
def p(name,kind,*vals):return node('P',[name,kind,'','A',*vals])
objects=[node('Model',[1000,'Model::Room','Null'],[node('Version',[232]),node('Properties70',[],[p('Lcl Translation','Lcl Translation',0.,0.,0.),p('Lcl Rotation','Lcl Rotation',0.,0.,0.),p('Lcl Scaling','Lcl Scaling',1.,1.,1.)])]),node('Material',[2000,'Material::Blue',''],[node('Version',[102]),node('ShadingModel',['phong']),node('Properties70',[],[p('DiffuseColor','Color',0.4,0.65,0.85)])]),node('Video',[3000,'Video::surface','Clip'],[node('RelativeFilename',['surface.png']),node('Filename',['surface.png']),node('Content',[png])]),node('Texture',[3001,'Texture::surface','TextureVideoClip'],[node('FileName',['surface.png']),node('RelativeFilename',['surface.png'])])]
connections=[node('C',['OO',1000,0]),node('C',['OO',3000,3001]),node('C',['OP',3001,2000,'DiffuseColor'])]
for i,(name,x,y,z,w,d,h) in enumerate(parts):
 g=100+i;m=200+i
 indices=[v if j<2 else -v-1 for face in faces for j,v in enumerate(face)]
 objects += [node('Geometry',[g,f'Geometry::{name}','Mesh'],[node('Vertices',[('d',vertices(w,d,h))]),node('PolygonVertexIndex',[('i',indices)])]),node('Model',[m,f'Model::{name}','Mesh'],[node('Version',[232]),node('Properties70',[],[p('Lcl Translation','Lcl Translation',float(x),float(y),float(z)),p('Lcl Rotation','Lcl Rotation',0.,0.,0.),p('Lcl Scaling','Lcl Scaling',1.,1.,1.)])])]
 connections += [node('C',['OO',g,m]),node('C',['OO',m,1000]),node('C',['OO',2000,m])]
nodes=[node('FBXHeaderExtension',[],[node('FBXHeaderVersion',[1003]),node('FBXVersion',[7400])]),node('GlobalSettings',[],[node('Version',[1000]),node('Properties70',[],[p('UpAxis','int',2),p('UpAxisSign','int',1),p('UnitScaleFactor','double',1.)])]),node('Objects',[],objects),node('Connections',[],connections)]
def ascii_node(n,depth=0):
 name,props,children=n;indent='\t'*depth
 def value(v):
  if isinstance(v,str):return '"'+v+'"'
  if isinstance(v,bytes):return '"'+base64.b64encode(v).decode()+'"'
  return str(v)
 if len(props)==1 and isinstance(props[0],tuple):
  vals=props[0][1];return f'{indent}{name}: *{len(vals)} {{\n{indent}\ta: '+','.join(map(str,vals))+f'\n{indent}}}\n'
 out=f'{indent}{name}: '+','.join(value(v) for v in props)
 if children:out+=' {\n'+''.join(ascii_node(c,depth+1) for c in children)+indent+'}'
 return out+'\n'
(root/'room-ascii.fbx').write_text('; FBX 7.4.0 project file\n'+''.join(ascii_node(n) for n in nodes))
def binary_prop(v):
 if isinstance(v,tuple):
  typ,vals=v;raw=struct.pack('<'+typ*len(vals),*vals);enc=zlib.compress(raw)
  return typ.encode()+struct.pack('<III',len(vals),1,len(enc))+enc
 if isinstance(v,str):
  if '::' in v: kind,name=v.split('::',1);v=name+'\0\1'+kind
  b=v.encode();return b'S'+struct.pack('<I',len(b))+b
 if isinstance(v,bytes):return b'R'+struct.pack('<I',len(v))+v
 if isinstance(v,float):return b'D'+struct.pack('<d',v)
 return b'L'+struct.pack('<q',v)
def binary_node(n,start):
 name,props,children=n;name=name.encode();pdata=b''.join(binary_prop(v) for v in props)
 head=13+len(name)+len(pdata);body=b''
 for c in children:body+=binary_node(c,start+head+len(body))
 if children:body+=bytes(13)
 end=start+head+len(body)
 return struct.pack('<IIIB',end,len(props),len(pdata),len(name))+name+pdata+body
out=b'Kaydara FBX Binary  \x00\x1a\x00'+struct.pack('<I',7400)
for n in nodes:out+=binary_node(n,len(out))
(root/'room-binary.fbx').write_bytes(out+bytes(13)+bytes(176))
xml=['<?xml version="1.0" encoding="utf-8"?><COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1"><asset><unit name="centimeter" meter="0.01"/><up_axis>Z_UP</up_axis></asset>', '<library_images><image id="surface"><init_from>surface.png</init_from></image></library_images>', '<library_effects><effect id="effect"><profile_COMMON><newparam sid="surface"><surface type="2D"><init_from>surface</init_from></surface></newparam><newparam sid="sampler"><sampler2D><source>surface</source></sampler2D></newparam><technique sid="common"><phong><diffuse><texture texture="sampler" texcoord="UV"/></diffuse></phong></technique></profile_COMMON></effect></library_effects><library_materials><material id="material"><instance_effect url="#effect"/></material></library_materials><library_geometries>']
for i,(name,x,y,z,w,d,h) in enumerate(parts):
 vals=' '.join(map(str,vertices(w,d,h)));idx=' '.join(str(v)+' '+str(v) for face in faces for v in face)
 xml.append(f'<geometry id="g{i}" name="{name}"><mesh><source id="pos{i}"><float_array id="arr{i}" count="24">{vals}</float_array><technique_common><accessor source="#arr{i}" count="8" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source><source id="uv{i}"><float_array id="uvarr{i}" count="16">0 0 1 0 1 1 0 1 0 0 1 0 1 1 0 1</float_array><technique_common><accessor source="#uvarr{i}" count="8" stride="2"><param name="S" type="float"/><param name="T" type="float"/></accessor></technique_common></source><vertices id="v{i}"><input semantic="POSITION" source="#pos{i}"/></vertices><triangles count="12" material="mat"><input semantic="VERTEX" source="#v{i}" offset="0"/><input semantic="TEXCOORD" source="#uv{i}" offset="1" set="0"/><p>{idx}</p></triangles></mesh></geometry>')
xml.append('</library_geometries><library_visual_scenes><visual_scene id="Room">')
for i,(name,x,y,z,w,d,h) in enumerate(parts):xml.append(f'<node id="n{i}" name="{name}"><translate>{x} {y} {z}</translate><instance_geometry url="#g{i}"><bind_material><technique_common><instance_material symbol="mat" target="#material"/></technique_common></bind_material></instance_geometry></node>')
xml.append('</visual_scene></library_visual_scenes><scene><instance_visual_scene url="#Room"/></scene></COLLADA>')
(root/'room.dae').write_text(''.join(xml))
