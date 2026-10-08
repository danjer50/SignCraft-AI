import type { ProjectAsset, SignDesign, SignObject } from './model';
import { shapeText, type TextGeometry } from './fonts/engine';

export type TextShapes=Record<string,TextGeometry>;
export const xml=(v:string)=>v.replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
export async function prepareTextShapes(design:SignDesign):Promise<TextShapes>{
 const entries=await Promise.all(design.objects.filter((o)=>o.kind==='text'&&o.visible).map(async(o)=>[o.id,await shapeText(o)] as const));return Object.fromEntries(entries);
}
export function objectShape(o:SignObject,shapes:TextShapes):string{
 if(o.kind==='text')return `<path d="${xml(shapes[o.id]?.path??'')}"/>`;
 if(o.kind==='ellipse')return `<ellipse cx="${o.width/2}" cy="${o.height/2}" rx="${o.width/2}" ry="${o.height/2}"/>`;
 return `<rect x="0" y="0" width="${o.width}" height="${o.height}" rx="${Math.min(o.radius,o.width/2,o.height/2)}"/>`;
}
export function designSvg(design:SignDesign,shapes:TextShapes,options:{technical?:boolean;night?:number;assetUrls?:Record<string,string>;dimensions?:boolean}={}):string{
 const margin=options.dimensions?Math.max(120,design.dimensions.width*.065):0;
 const {width,height}=design.dimensions;const night=options.night??0;const tech=!!options.technical;
 const objects=design.objects.filter((o)=>o.visible).map((o)=>{
  const transform=`translate(${o.x} ${o.y}) rotate(${o.rotation} ${o.width/2} ${o.height/2})`;
  const style=tech?`fill="none" stroke="#1d2b32" stroke-width="1.5"`: `fill="${o.color}" stroke="${o.outlineColor}" stroke-width="${o.outline}"${night&&o.kind==='text'&&design.lighting.type!=='none'?` filter="url(#light)"`:''}`;
  if(o.kind==='logo'){const url=o.assetId?options.assetUrls?.[o.assetId]:undefined;return url&&!tech?`<g transform="${transform}"><image href="${xml(url)}" width="${o.width}" height="${o.height}" preserveAspectRatio="xMidYMid meet"/></g>`:`<g transform="${transform}" ${style}><rect width="${o.width}" height="${o.height}"/><path d="M0 0L${o.width} ${o.height}M${o.width} 0L0 ${o.height}"/></g>`;}
  return `<g data-object="${o.id}" transform="${transform}" ${style}>${objectShape(o,shapes)}</g>`;
 }).join('');
 const dims=options.dimensions?`<g fill="none" stroke="#4b626d" stroke-width="2"><path d="M0 ${height+margin*.35}V${height+margin*.75}M${width} ${height+margin*.35}V${height+margin*.75}M0 ${height+margin*.55}H${width}"/><path d="M${-margin*.65} 0H${-margin*.2}M${-margin*.65} ${height}H${-margin*.2}M${-margin*.45} 0V${height}"/></g><g font-family="sans-serif" fill="#243e4a" font-size="${margin*.22}" text-anchor="middle"><text x="${width/2}" y="${height+margin*.85}">${width} mm</text><text x="${-margin*.58}" y="${height/2}" transform="rotate(-90 ${-margin*.58} ${height/2})">${height} mm</text></g>`:'';
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${width+margin*2}mm" height="${height+margin*2}mm" viewBox="${-margin} ${-margin} ${width+margin*2} ${height+margin*2}"><title>${xml(design.name)} — ${tech?'technical elevation, review required':'editable sign design'}</title><desc>Physical units: millimetres. ${tech?'No structural or electrical approval.':'Text is shaped licensed-font vector geometry.'}</desc><defs><filter id="light" x="-30%" y="-50%" width="160%" height="200%"><feGaussianBlur stdDeviation="${4*night*design.lighting.brightness}"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>${objects}${dims}</svg>`;
}
export function svgData(svg:string):string{return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;}
export function assetPreviewUrls(assets:ProjectAsset[]):Record<string,string>{return Object.fromEntries(assets.map((a)=>[a.id,a.preview]));}
export function partSchedule(design:SignDesign){return design.objects.filter((o)=>o.visible).map((o)=>({id:o.id,name:o.name,quantity:1,material:o.material,widthMm:o.width,heightMm:o.height,depthMm:o.depth,finish:o.finish,kind:o.kind,review:o.kind==='logo'?'Raster logo: vector artwork needed for cutting.':'Concept component, verify specification before fabrication.'}));}
