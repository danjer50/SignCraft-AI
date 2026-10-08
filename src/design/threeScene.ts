import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import type { SignDesign, SignObject } from './model';
import { objectShape, xml, type TextShapes } from './render';

const SCALE=.001; // Authoritative mm model → glTF/Three metre units.
export function objectGeometry(object:SignObject,shapes:TextShapes):THREE.ExtrudeGeometry{
 const svg=`<svg xmlns="http://www.w3.org/2000/svg">${objectShape(object,shapes)}</svg>`;
 const parsed=new SVGLoader().parse(svg);const paths=parsed.paths.flatMap((path)=>SVGLoader.createShapes(path));
 return new THREE.ExtrudeGeometry(paths,{depth:object.depth,steps:1,bevelEnabled:object.depth>2,bevelSize:Math.min(.7,object.depth*.025),bevelThickness:Math.min(.7,object.depth*.025),bevelSegments:2,curveSegments:10});
}
export function materialFor(object:SignObject,design:SignDesign,night:number):THREE.MeshStandardMaterial{
 const metal=['aluminium','stainlessSteel','galvanizedSteel'].includes(object.material);
 const lit=object.kind==='text'&&design.lighting.type!=='none'||object.kind==='panel'&&design.construction==='lightbox';
 return new THREE.MeshStandardMaterial({color:object.color,metalness:metal?.85:.05,roughness:object.finish==='polished'?.2:object.finish==='matte'?.8:.45,emissive:lit?design.lighting.color:'#000000',emissiveIntensity:lit?night*design.lighting.brightness*.55:0,side:THREE.DoubleSide});
}
export function buildSignGroup(design:SignDesign,shapes:TextShapes,options:{night?:number;exploded?:boolean;includeMounting?:boolean}={}):THREE.Group{
 const glyphs=Object.values(shapes).reduce((sum,s)=>sum+s.glyphCount,0);
 if(glyphs>800)throw new Error('This model exceeds the interactive glyph budget. Use the technical view or simplify text before 3D export.');
 if(Object.values(shapes).some((s)=>s.missingGlyphs))throw new Error('The selected font does not contain every glyph. Choose another font before a 3D or cutting export.');
 const group=new THREE.Group();group.name='SignCraft physical sign (exterior concept geometry)';
 group.userData={schemaVersion:2,units:'metres',sourceUnits:'millimetres',dimensionsMm:design.dimensions,construction:design.construction,engineeringApproval:false,limitations:'Exterior geometry and illustrative mounting. No internal wiring, structural approval or fabrication certification.'};
 const content=new THREE.Group();content.scale.set(SCALE,-SCALE,SCALE);content.position.set(-design.dimensions.width*SCALE/2,design.dimensions.height*SCALE/2,0);group.add(content);
 design.objects.filter((o)=>o.visible).forEach((object,index)=>{
  const geometry=objectGeometry(object,shapes);const material=materialFor(object,design,options.night??0);
  const mesh=new THREE.Mesh(geometry,material);mesh.name=xml(object.name);mesh.userData={objectId:object.id,material:object.material,thicknessMm:object.depth};
  const rotation=new THREE.Group();rotation.position.set(object.x+object.width/2,object.y+object.height/2,object.kind==='panel'?-object.depth:2+(options.exploded?index*55:0));rotation.rotation.z=THREE.MathUtils.degToRad(object.rotation);mesh.position.set(-object.width/2,-object.height/2,0);mesh.castShadow=true;mesh.receiveShadow=true;rotation.add(mesh);content.add(rotation);
 });
 if(options.includeMounting!==false){
  const mount=new THREE.Group();mount.name='Illustrative installation hardware';
  const width=design.dimensions.width*SCALE,height=design.dimensions.height*SCALE,clearance=design.mounting.clearance*SCALE;
  const mat=new THREE.MeshStandardMaterial({color:'#737f83',metalness:.8,roughness:.45});
  if(design.mounting.type==='rail'){for(const y of [-height*.3,height*.3]){const rail=new THREE.Mesh(new THREE.BoxGeometry(width*.86,.028,.028),mat);rail.position.set(0,y,-clearance-.018);rail.castShadow=true;mount.add(rail);}}
  else if(design.mounting.type==='bracket'){for(const y of [-height*.28,height*.28]){const projection=Math.max(.15,design.mounting.projection*SCALE);const bracket=new THREE.Mesh(new THREE.BoxGeometry(projection,.035,.035),mat);bracket.position.set(-width/2-projection/2,y,-clearance-.02);mount.add(bracket);}}
  else if(design.mounting.type==='posts'){for(const x of [-width*.3,width*.3]){const post=new THREE.Mesh(new THREE.BoxGeometry(.08,height*.75,.08),mat);post.position.set(x,-height*.67,-.04);mount.add(post);}}
  else if(design.mounting.type==='suspended'){for(const x of [-width*.35,width*.35]){const cable=new THREE.Mesh(new THREE.CylinderGeometry(.005,.005,.45,10),mat);cable.position.set(x,height*.5+.225,-.01);mount.add(cable);}}
  else if(design.mounting.type==='standoffs'){for(let i=0;i<design.mounting.points;i++){const x=(i%2===0?-1:1)*width*.38,y=(Math.floor(i/2)%2===0?-1:1)*height*.35;const standoff=new THREE.Mesh(new THREE.CylinderGeometry(.009,.009,Math.max(.01,clearance),12),mat);standoff.rotation.x=Math.PI/2;standoff.position.set(x,y,-clearance/2-.005);mount.add(standoff);}}
  group.add(mount);
 }
 return group;
}
export function disposeGroup(group:THREE.Object3D):void{group.traverse((child)=>{if(child instanceof THREE.Mesh){child.geometry.dispose();const materials=Array.isArray(child.material)?child.material:[child.material];for(const material of materials)material.dispose();}});}
