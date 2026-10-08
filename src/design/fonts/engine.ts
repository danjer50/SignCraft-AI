import { create, type Font } from 'fontkit';
import bidiFactory from 'bidi-js';
import { FONT_CATALOGUE, type FontId } from './catalogue';
import type { SignObject } from '../model';

const bidi=bidiFactory();
const cache=new Map<FontId,Promise<Font>>();
export type FontLoader=(url:string)=>Promise<Uint8Array>;
const defaultLoader:FontLoader=async(url)=>{const response=await fetch(url);if(!response.ok)throw new Error('Font could not be loaded.');const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length>4_000_000)throw new Error('Font exceeds resource budget.');return bytes;};
export async function loadFont(id:FontId,loader:FontLoader=defaultLoader):Promise<Font>{
 let pending=cache.get(id);if(!pending){const metadata=FONT_CATALOGUE.find((f)=>f.id===id);if(!metadata)throw new Error('Unknown licensed font.');pending=(async()=>{const bytes=await loader(metadata.url);const font=create(bytes as unknown as Buffer) as Font;if(typeof FontFace!=='undefined'&&typeof document!=='undefined'){const face=new FontFace(metadata.name,bytes,{weight:'100 900'});await face.load();document.fonts.add(face);}return font;})();cache.set(id,pending);pending.catch(()=>cache.delete(id));if(cache.size>12){const oldest=cache.keys().next().value;if(oldest&&oldest!==id)cache.delete(oldest);}}
 return pending;
}
export interface TextGeometry {path:string;glyphCount:number;missingGlyphs:boolean;fonts:FontId[];width:number;height:number}
const round=(v:number)=>Number(v.toFixed(3));
function pathForGlyph(glyph:ReturnType<Font['glyphForCodePoint']>,x:number,y:number,scale:number):string {
 const output:string[]=[];
 for(const command of glyph.path.commands){const a=command.args;const xy=(i:number)=>`${round(x+a[i]*scale)} ${round(y-a[i+1]*scale)}`;
  if(command.command==='moveTo')output.push(`M${xy(0)}`);
  else if(command.command==='lineTo')output.push(`L${xy(0)}`);
  else if(command.command==='quadraticCurveTo')output.push(`Q${xy(0)} ${xy(2)}`);
  else if(command.command==='bezierCurveTo')output.push(`C${xy(0)} ${xy(2)} ${xy(4)}`);
  else if(command.command==='closePath')output.push('Z');
 }return output.join('');
}
/** Shared shaped outlines: SVG, real extrusions and cutting exports use the same glyph geometry. */
export async function shapeText(object:SignObject,loader?:FontLoader):Promise<TextGeometry>{
 const selected=await loadFont(object.fontId,loader);
 const arabic=FONT_CATALOGUE.find((f)=>f.id===object.fontId)?.arabic?selected:await loadFont('notosansarabic',loader);
 const latin=FONT_CATALOGUE.find((f)=>f.id===object.fontId)?.arabic?await loadFont('spacegrotesk',loader):selected;
 const lines=object.text.split('\n').slice(0,8);
 const paths:string[]=[];let glyphCount=0,missingGlyphs=false;const usedFonts=new Set<FontId>();
 const totalHeight=object.height;const lineHeight=totalHeight/(Math.max(1,lines.length)*object.leading);
 for(let li=0;li<lines.length;li++){
  const text=lines[li];if(!text)continue;
  const levels=bidi.getEmbeddingLevels(text);const order=bidi.getReorderedIndices(text,levels);const rank=new Map(order.map((index,visual)=>[index,visual]));
  const runs:{start:number;end:number;rtl:boolean;isArabic:boolean;text:string}[]=[];
  let start=0,rtl=!!(levels.levels[0]&1),isArabic=/\p{Script=Arabic}/u.test(text[0]??'');
  for(let i=1;i<=text.length;i++){
   const direction=!!(levels.levels[i]&1);const script=/\p{Script=Arabic}/u.test(text[i]??'');
   const significant=/[\p{L}\p{N}]/u.test(text[i]??'');
   if(i===text.length||direction!==rtl||(significant&&script!==isArabic)){runs.push({start,end:i-1,rtl,isArabic,text:text.slice(start,i)});start=i;rtl=direction;if(significant)isArabic=script;}
  }
  runs.sort((a,b)=>Math.min(...Array.from({length:a.end-a.start+1},(_,i)=>rank.get(a.start+i)??a.start+i))-Math.min(...Array.from({length:b.end-b.start+1},(_,i)=>rank.get(b.start+i)??b.start+i)));
  const laid=await Promise.all(runs.map(async(run)=>{
   let font=run.isArabic?arabic:latin;
   const variations=font.variationAxes;
   if(variations&&variations.wght)font=font.getVariation({wght:Math.min(variations.wght.max,Math.max(variations.wght.min,object.weight))});
   const result=font.layout(run.text,undefined,undefined,undefined,run.rtl?'rtl':'ltr');
   const em=font.unitsPerEm;const scale=lineHeight/em;
   const width=result.positions.reduce((sum,p)=>sum+p.xAdvance*scale,0)+Math.max(0,result.glyphs.length-1)*object.tracking;
   usedFonts.add(run.isArabic?(FONT_CATALOGUE.find((f)=>f.id===object.fontId)?.arabic?object.fontId:'notosansarabic'):(FONT_CATALOGUE.find((f)=>f.id===object.fontId)?.arabic?'spacegrotesk':object.fontId));
   return {result,scale,width,font};
  }));
  const naturalWidth=laid.reduce((sum,r)=>sum+r.width,0);const scaleX=Math.min(1,object.width/Math.max(1,naturalWidth));
  const padding=object.align==='left'?0:object.align==='right'?object.width-naturalWidth*scaleX:(object.width-naturalWidth*scaleX)/2;
  let cursor=padding/scaleX;
  const baseline=lineHeight*.82+li*lineHeight*object.leading;
  for(const run of laid){for(let i=0;i<run.result.glyphs.length;i++){
    const glyph=run.result.glyphs[i],pos=run.result.positions[i];glyphCount++;if(glyph.id===0)missingGlyphs=true;
    const raw=pathForGlyph(glyph,cursor+pos.xOffset*run.scale,baseline-pos.yOffset*run.scale,run.scale);
    // Path x scaling is deterministic and preserves the layout box when fonts change.
    const scaled=raw.replace(/([MLQC])([^ZMLQC]*)/g,(_,cmd:string,values:string)=>{const nums=values.trim().split(/\s+/).filter(Boolean).map(Number);return cmd+nums.map((v,index)=>String(round(index%2===0?v*scaleX:v))).join(' ');});
    paths.push(scaled);cursor+=pos.xAdvance*run.scale+(i<run.result.glyphs.length-1?object.tracking:0);
  }}
 }
 return {path:paths.join(''),glyphCount,missingGlyphs,fonts:[...usedFonts],width:object.width,height:object.height};
}
