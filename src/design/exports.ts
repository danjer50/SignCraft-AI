import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { ProjectAsset, SignDesign, StudioProject } from './model';
import { designSvg, prepareTextShapes, type TextShapes, assetPreviewUrls, partSchedule } from './render';

export function downloadBlob(blob:Blob,name:string):void{
 const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
export function safeFilename(value:string):string{return value.replace(/[^\p{L}\p{N}._-]+/gu,'-').slice(0,80)||'signcraft';}
export async function svgToPng(svg:string,width=2048):Promise<Blob>{
 const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));const image=new Image();
 try{
  await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Image export timed out.')),12000);image.onload=()=>{clearTimeout(timer);resolve();};image.onerror=()=>{clearTimeout(timer);reject(new Error('The design could not be rasterized.'));};image.src=url;});
  const canvas=document.createElement('canvas');canvas.width=Math.min(4096,Math.max(256,width));canvas.height=Math.min(4096,Math.max(1,Math.round(canvas.width*image.naturalHeight/image.naturalWidth)));
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Image export is unavailable.');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
  try{return await new Promise<Blob>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('PNG export timed out.')),8000);canvas.toBlob((blob)=>{clearTimeout(timer);if(blob)resolve(blob);else reject(new Error('PNG export failed.'));},'image/png');});}finally{canvas.width=0;canvas.height=0;}
 }finally{image.src='';URL.revokeObjectURL(url);}
}
export async function exportSvg(design:SignDesign):Promise<Blob>{const shapes=await prepareTextShapes(design);if(Object.values(shapes).some((s)=>s.missingGlyphs))throw new Error('Some text glyphs are missing. Choose a supporting font before exporting.');if(design.objects.some((o)=>o.visible&&o.kind==='logo'))throw new Error('Raster logos cannot be exported as cutting vectors. Hide the logo or supply separate verified vector artwork.');return new Blob([designSvg(design,shapes)],{type:'image/svg+xml'});}
export function dxfFromDesign(design:SignDesign,shapes:TextShapes):string{
 if(design.objects.some((o)=>o.visible&&o.kind==='logo'))throw new Error('DXF cannot turn a bitmap logo into cutting geometry. Hide the logo and include vector artwork separately.');
 if(Object.values(shapes).some((s)=>s.missingGlyphs))throw new Error('Missing font glyphs: cutting export was stopped.');
 const lines:string[]=['0','SECTION','2','HEADER','9','$ACADVER','1','AC1015','9','$INSUNITS','70','4','0','ENDSEC','0','SECTION','2','ENTITIES'];
 const polygon=(points:{x:number;y:number}[],layer:string)=>{if(points.length<3)return;lines.push('0','LWPOLYLINE','8',layer,'90',String(points.length),'70','1');for(const p of points)lines.push('10',p.x.toFixed(3),'20',(-p.y).toFixed(3));};
 for(const o of design.objects.filter((o)=>o.visible)){
  const angle=o.rotation*Math.PI/180;const transform=(p:{x:number;y:number})=>{const x=p.x-o.width/2,y=p.y-o.height/2;return{x:o.x+o.width/2+x*Math.cos(angle)-y*Math.sin(angle),y:o.y+o.height/2+x*Math.sin(angle)+y*Math.cos(angle)};};
  if(o.kind==='text'){
   const d=shapes[o.id]?.path;if(!d)continue;
   const commands=d.match(/[MLQCZ][^MLQCZ]*/g)??[];let current={x:0,y:0},start=current,points:{x:number;y:number}[]=[];
   for(const command of commands){const type=command[0],a=command.slice(1).trim().split(/[ ,]+/).filter(Boolean).map(Number);
    if(type==='M'){if(points.length)polygon(points.map(transform),o.id);points=[];current={x:a[0],y:a[1]};start=current;points.push(current);}
    else if(type==='L'){current={x:a[0],y:a[1]};points.push(current);}
    else if(type==='Q'||type==='C'){const before=current,steps=24;for(let i=1;i<=steps;i++){const t=i/steps,u=1-t;if(type==='Q')current={x:u*u*before.x+2*u*t*a[0]+t*t*a[2],y:u*u*before.y+2*u*t*a[1]+t*t*a[3]};else current={x:u*u*u*before.x+3*u*u*t*a[0]+3*u*t*t*a[2]+t*t*t*a[4],y:u*u*u*before.y+3*u*u*t*a[1]+3*u*t*t*a[3]+t*t*t*a[5]};points.push(current);}}
    else if(type==='Z'){polygon(points.map(transform),o.id);points=[];current=start;}
   }if(points.length)polygon(points.map(transform),o.id);
  }else if(o.kind==='ellipse')polygon(Array.from({length:96},(_,i)=>transform({x:o.width/2+o.width/2*Math.cos(i*Math.PI/48),y:o.height/2+o.height/2*Math.sin(i*Math.PI/48)})),o.id);
  else polygon([{x:0,y:0},{x:o.width,y:0},{x:o.width,y:o.height},{x:0,y:o.height}].map(transform),o.id);
 }
 lines.push('0','ENDSEC','0','EOF');return lines.join('\n')+'\n';
}
export async function exportGlb(design:SignDesign,shapes:TextShapes):Promise<Blob>{
 if(design.objects.some((o)=>o.visible&&o.kind==='logo'))throw new Error('3D logo geometry is not available for bitmap assets. Hide the logo before GLB export.');
 const [{GLTFExporter},{buildSignGroup,disposeGroup}]=await Promise.all([import('three/examples/jsm/exporters/GLTFExporter.js'),import('./threeScene')]);const group=buildSignGroup(design,shapes);
 try{const bytes=await new GLTFExporter().parseAsync(group,{binary:true,onlyVisible:true});if(!(bytes instanceof ArrayBuffer))throw new Error('GLB export returned invalid data.');return new Blob([bytes],{type:'model/gltf-binary'});}finally{disposeGroup(group);}
}
export async function exportPresentation(design:SignDesign,assets:ProjectAsset[],shapes:TextShapes,technical=false):Promise<Blob>{
 const pdf=await PDFDocument.create();const font=await pdf.embedFont(StandardFonts.Helvetica);const bold=await pdf.embedFont(StandardFonts.HelveticaBold);const page=pdf.addPage([842,595]);
 page.drawRectangle({x:0,y:0,width:842,height:595,color:rgb(.055,.095,.115)});page.drawText('SIGNCRAFT / ATELIER',{x:42,y:550,size:12,font:bold,color:rgb(.86,.72,.48)});
 page.drawText(technical?'TECHNICAL CONCEPT / REVIEW REQUIRED':'CLIENT PRESENTATION / DESIGN CONCEPT',{x:42,y:521,size:10,font,color:rgb(.77,.82,.83)});
 const svg=designSvg(design,shapes,{technical,dimensions:technical,assetUrls:assetPreviewUrls(assets)});const png=await svgToPng(svg,2400);const image=await pdf.embedPng(await png.arrayBuffer());const fitted=image.scaleToFit(740,310);page.drawImage(image,{x:(842-fitted.width)/2,y:175+(310-fitted.height)/2,width:fitted.width,height:fitted.height});
 const info=[`Dimensions: ${design.dimensions.width} x ${design.dimensions.height} x ${design.dimensions.depth} mm`,`Construction: ${design.construction} / Lighting: ${design.lighting.type}`,`Mounting: ${design.mounting.type} / Clearance: ${design.mounting.clearance} mm`,`Materials: ${[...new Set(design.objects.filter((o)=>o.visible).map((o)=>o.material))].join(', ')}`];
 info.forEach((line,i)=>page.drawText(line,{x:42,y:145-i*19,size:11,font,color:rgb(.86,.89,.89)}));
 page.drawText('Concept geometry. Verify site measurements, materials, fixing loads and electrical design before fabrication.',{x:42,y:35,size:9,font,color:rgb(.65,.73,.75)});
 if(technical){const parts=pdf.addPage([842,595]);parts.drawText('COMPONENT SCHEDULE / millimetres',{x:42,y:550,size:18,font:bold});partSchedule(design).forEach((part,i)=>{if(i>25)return;const name=part.name.replace(/[^\x20-\x7e]/g,'?');parts.drawText(`${i+1}. ${name} | ${part.material} | ${Math.round(part.widthMm)} x ${Math.round(part.heightMm)} x ${part.depthMm} | Qty ${part.quantity}`,{x:42,y:513-i*17,size:10,font});});parts.drawText('Exterior concept components, not an approved bill of materials or installation/engineering certification.',{x:42,y:35,size:9,font});}
 return new Blob([await pdf.save() as BlobPart],{type:'application/pdf'});
}
export async function exportProjectBackup(project:StudioProject):Promise<Blob>{
 const assets=await Promise.all(project.assets.map(async(asset)=>{if(!asset.blob)throw new Error(`Original asset unavailable: ${asset.name}. Fetch it before exporting a complete backup.`);const bytes=new Uint8Array(await asset.blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return {...asset,blob:undefined,data:btoa(binary)};}));
 return new Blob([JSON.stringify({...project,assets},null,2)],{type:'application/json'});
}
