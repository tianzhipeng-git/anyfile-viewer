import { writeFileSync } from "node:fs";
const dir = new URL("./", import.meta.url);
const vertices = [[0,0,0],[1,0,0],[0,1,0],[0,0,1]];
const faces = [[0,2,1],[0,1,3],[0,3,2],[1,2,3]];
writeFileSync(new URL("tetra.stl", dir), `solid tetra\n${faces.map(f=>`facet normal 0 0 0\nouter loop\n${f.map(i=>`vertex ${vertices[i].join(" ")}`).join("\n")}\nendloop\nendfacet`).join("\n")}\nendsolid tetra\n`);
const binary = Buffer.alloc(84 + faces.length * 50); binary.write("solid binary tetra"); binary.writeUInt32LE(faces.length,80);
faces.forEach((f,i)=>f.forEach((v,j)=>vertices[v].forEach((n,k)=>binary.writeFloatLE(n,84+i*50+12+j*12+k*4))));
writeFileSync(new URL("binary.stl",dir),binary);
writeFileSync(new URL("tetra.obj", dir), `o Tetrahedron\n${vertices.map(v=>`v ${v.join(" ")}`).join("\n")}\n${faces.map(f=>`f ${f.map(i=>i+1).join(" ")}`).join("\n")}\n`);
writeFileSync(new URL("tetra.off", dir), `OFF\n4 4 6\n${vertices.map(v=>v.join(" ")).join("\n")}\n${faces.map(f=>`3 ${f.join(" ")}`).join("\n")}\n`);
writeFileSync(new URL("tetra.ply", dir), `ply\nformat ascii 1.0\nelement vertex 4\nproperty float x\nproperty float y\nproperty float z\nelement face 4\nproperty list uchar int vertex_indices\nend_header\n${vertices.map(v=>v.join(" ")).join("\n")}\n${faces.map(f=>`3 ${f.join(" ")}`).join("\n")}\n`);
const positions = new Float32Array(faces.flatMap(f=>f.flatMap(i=>vertices[i]))); const buffer = Buffer.from(positions.buffer);
const gltf = {asset:{version:"2.0"},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0,name:"Tetrahedron"}],meshes:[{primitives:[{attributes:{POSITION:0}}]}],buffers:[{byteLength:buffer.length,uri:"tetra.bin"}],bufferViews:[{buffer:0,byteOffset:0,byteLength:buffer.length}],accessors:[{bufferView:0,componentType:5126,count:12,type:"VEC3",min:[0,0,0],max:[1,1,1]}]};
writeFileSync(new URL("tetra.bin",dir),buffer); writeFileSync(new URL("tetra.gltf",dir),JSON.stringify(gltf));
delete gltf.buffers[0].uri; const json=Buffer.from(JSON.stringify(gltf)); const len=Math.ceil(json.length/4)*4; const glb=Buffer.alloc(12+8+len+8+buffer.length,32);
glb.write("glTF");glb.writeUInt32LE(2,4);glb.writeUInt32LE(glb.length,8);glb.writeUInt32LE(len,12);glb.writeUInt32LE(0x4e4f534a,16);json.copy(glb,20);glb.writeUInt32LE(buffer.length,20+len);glb.writeUInt32LE(0x004e4942,24+len);buffer.copy(glb,28+len);writeFileSync(new URL("tetra.glb",dir),glb);
// A self-contained animation and a missing optional texture exercise independent paths.
const animated = JSON.parse(JSON.stringify(gltf));
const times = Buffer.from(new Float32Array([0,1,2]).buffer);
const translations = Buffer.from(new Float32Array([0,0,0, 0,2,0, 0,0,0]).buffer);
const animatedBuffer = Buffer.concat([buffer,times,translations]);
animated.buffers[0]={byteLength:animatedBuffer.length,uri:`data:application/octet-stream;base64,${animatedBuffer.toString('base64')}`};
animated.bufferViews.push({buffer:0,byteOffset:buffer.length,byteLength:times.length},{buffer:0,byteOffset:buffer.length+times.length,byteLength:translations.length});
animated.accessors.push({bufferView:1,componentType:5126,count:3,type:'SCALAR',min:[0],max:[2]},{bufferView:2,componentType:5126,count:3,type:'VEC3'});
animated.animations=[{name:'Vertical motion',samplers:[{input:1,output:2,interpolation:'LINEAR'}],channels:[{sampler:0,target:{node:0,path:'translation'}}]}];
writeFileSync(new URL('animated.gltf',dir),JSON.stringify(animated));
const missing=JSON.parse(JSON.stringify(animated));delete missing.animations;
missing.images=[{uri:'absent.png'}];missing.textures=[{source:0}];missing.materials=[{pbrMetallicRoughness:{baseColorTexture:{index:0}}}];missing.meshes[0].primitives[0].material=0;
writeFileSync(new URL('missing-texture.gltf',dir),JSON.stringify(missing));

// Binary PLY endian variants include RGB properties and indexed faces.
for(const endian of ['little','big']) {
 const header=Buffer.from(`ply\nformat binary_${endian}_endian 1.0\nelement vertex 4\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nelement face 4\nproperty list uchar int vertex_indices\nend_header\n`);
 const data=Buffer.alloc(4*15+4*13);let offset=0;
 for(const point of vertices){for(const coordinate of point){data[endian==='little'?'writeFloatLE':'writeFloatBE'](coordinate,offset);offset+=4;}data.set([220,100,60],offset);offset+=3;}
 for(const face of faces){data[offset++]=3;for(const index of face){data[endian==='little'?'writeInt32LE':'writeInt32BE'](index,offset);offset+=4;}}
 writeFileSync(new URL(`binary-${endian}.ply`,dir),Buffer.concat([header,data]));
}
writeFileSync(new URL('material.obj',dir),'mtllib material.mtl\n'+`o Tetrahedron\n${vertices.map(v=>`v ${v.join(' ')}`).join('\n')}\nusemtl Blue\n${faces.map(f=>`f ${f.map(i=>i+1).join(' ')}`).join('\n')}\n`);
writeFileSync(new URL('material.mtl',dir),'newmtl Blue\nKd 0.1 0.4 0.9\n');
