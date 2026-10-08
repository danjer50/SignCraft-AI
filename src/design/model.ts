import { fingerprint } from '../domain/provenance.js';
import { FONT_CATALOGUE, type FontId } from './fonts/catalogue.js';
import type { SignConfiguration } from '../domain/sign.js';

export const CONSTRUCTIONS = ['channel', 'panel', 'acrylic', 'lightbox', 'neon', 'projecting', 'hanging', 'totem', 'monument', 'window', 'vehicle'] as const;
export type Construction = typeof CONSTRUCTIONS[number];
export const MATERIAL_IDS = ['aluminiumComposite', 'aluminium', 'acrylic', 'pvc', 'polycarbonate', 'stainlessSteel', 'galvanizedSteel', 'wood', 'vinyl', 'neonFlex'] as const;
export type MaterialId = typeof MATERIAL_IDS[number];
export type Unit = 'mm' | 'cm' | 'm';
export type ViewMode = 'design' | 'mounted' | 'product' | 'technical' | 'presentation';
export type CameraView = 'perspective' | 'front' | 'back' | 'side' | 'top';
export interface Dimensions { width: number; height: number; depth: number }
export interface Point { x: number; y: number }
export interface SignObject {
  id: string; name: string; kind: 'panel' | 'text' | 'ellipse' | 'line' | 'logo';
  visible: boolean; locked: boolean;
  x: number; y: number; width: number; height: number; rotation: number;
  depth: number; material: MaterialId; color: string; finish: 'matte' | 'satin' | 'polished';
  text: string; fontId: FontId; weight: number; tracking: number; leading: number;
  align: 'left' | 'center' | 'right'; outline: number; outlineColor: string;
  assetId?: string; radius: number;
}
export interface SignDesign {
  schemaVersion: 2; name: string; business: string; businessType: string; style: string;
  construction: Construction; dimensions: Dimensions; unit: Unit;
  objects: SignObject[];
  lighting: { type: 'none' | 'front' | 'halo' | 'internal' | 'edge' | 'neon'; color: string; brightness: number };
  mounting: { type: 'direct' | 'standoffs' | 'rail' | 'bracket' | 'posts' | 'suspended'; clearance: number; projection: number; points: number; exploded: boolean };
  placement: [Point, Point, Point, Point];
  sourceAssetId?: string; logoAssetId?: string; templateId?: string;
  brandColors: string[]; notes: string;
}
export interface ProjectAsset { id: string; kind: 'storefront' | 'logo' | 'concept'; name: string; mime: string; digest: string; width: number; height: number; size: number; preview: string; blob?: Blob; remote?: boolean }
export interface DesignVersion { id: string; name: string; createdAt: string; fingerprint: string; design: SignDesign }
export interface StoredConcept { id: string; createdAt: string; fingerprint: string; snapshot: SignDesign; imageAssetId: string; provider: string; diagnosticId?: string; promptVersion: string; sourceDigest: string }
export interface StudioProject {
  schemaVersion: 2; id: string; name: string; createdAt: string; updatedAt: string; revision: number;
  design: SignDesign; versions: DesignVersion[]; concepts: StoredConcept[]; assets: ProjectAsset[];
  cloudRevision?: number; ownerId?: string;
}
export const UNIT_SCALE: Record<Unit, number> = { mm: 1, cm: 10, m: 1000 };
export function fromUnit(value: number, unit: Unit): number { return value * UNIT_SCALE[unit]; }
export function toUnit(mm: number, unit: Unit): number { return mm / UNIT_SCALE[unit]; }
export function id(): string { return globalThis.crypto.randomUUID(); }
export function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
export function designFingerprint(design: SignDesign): string { return fingerprint(design); }
export function hex(value: unknown): value is string { return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value); }
const fontIds = new Set<string>(FONT_CATALOGUE.map((font) => font.id));
const finite = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const string = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max;
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
export function validateDesign(value: unknown): value is SignDesign {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const d = value as SignDesign;
  if (d.schemaVersion !== 2 || !string(d.name, 120) || !string(d.business, 120) || !string(d.businessType, 80) || !string(d.style, 80) || !string(d.notes, 2000)) return false;
  if (!CONSTRUCTIONS.includes(d.construction) || !['mm', 'cm', 'm'].includes(d.unit)) return false;
  if (!d.dimensions || !finite(d.dimensions.width, 50, 20000) || !finite(d.dimensions.height, 50, 10000) || !finite(d.dimensions.depth, 0.1, 1000)) return false;
  if (!Array.isArray(d.objects) || !d.objects.length || d.objects.length > 64 || new Set(d.objects.map((o) => o.id)).size !== d.objects.length) return false;
  for (const o of d.objects) {
    if (!o || !identifier(o.id) || !string(o.name, 100) || !['panel','text','ellipse','line','logo'].includes(o.kind) || typeof o.visible !== 'boolean' || typeof o.locked !== 'boolean') return false;
    if (!finite(o.x, -20000, 40000) || !finite(o.y, -10000, 20000) || !finite(o.width, 1, 20000) || !finite(o.height, 1, 10000) || !finite(o.depth, 0.1, 1000) || !finite(o.rotation, -360, 360) || !finite(o.radius, 0, 5000)) return false;
    if (!MATERIAL_IDS.includes(o.material) || !hex(o.color) || !hex(o.outlineColor) || !['matte','satin','polished'].includes(o.finish)) return false;
    if (!string(o.text, 384) || !fontIds.has(o.fontId) || !finite(o.weight, 100, 900) || !finite(o.tracking, -30, 100) || !finite(o.leading, 0.5, 3) || !['left','center','right'].includes(o.align) || !finite(o.outline, 0, 20)) return false;
    if (o.assetId !== undefined && !identifier(o.assetId)) return false;
  }
  if (!d.lighting || !['none','front','halo','internal','edge','neon'].includes(d.lighting.type) || !hex(d.lighting.color) || !finite(d.lighting.brightness, 0, 3)) return false;
  if (!d.mounting || !['direct','standoffs','rail','bracket','posts','suspended'].includes(d.mounting.type) || !finite(d.mounting.clearance, 0, 1000) || !finite(d.mounting.projection, 0, 3000) || !finite(d.mounting.points, 2, 12) || !Number.isInteger(d.mounting.points) || typeof d.mounting.exploded !== 'boolean') return false;
  if (!Array.isArray(d.placement) || d.placement.length !== 4 || d.placement.some((p) => !p || !finite(p.x, 0, 100) || !finite(p.y, 0, 100))) return false;
  const area = d.placement.reduce((sum,p,i) => { const q=d.placement[(i+1)%4]; return sum+p.x*q.y-p.y*q.x; },0)/2;
  if (area < 1) return false;
  // Convex clockwise physical plane; reject folded/self-crossing projection quads.
  for (let i=0;i<4;i++) { const a=d.placement[i],b=d.placement[(i+1)%4],c=d.placement[(i+2)%4]; if ((b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x) <= 0) return false; }
  if (!Array.isArray(d.brandColors) || d.brandColors.length > 8 || d.brandColors.some((v) => !hex(v))) return false;
  return [d.sourceAssetId,d.logoAssetId,d.templateId].every((v) => v === undefined || identifier(v));
}
export function newObject(kind: SignObject['kind'], overrides: Partial<SignObject> = {}): SignObject {
  return { id: id(), name: kind, kind, visible: true, locked: false, x: 200, y: 180, width: 2000, height: 280, rotation: 0, depth: kind === 'text' ? 40 : 5, material: 'acrylic', color: '#f1dfbf', finish: 'satin', text: 'YOUR NAME', fontId: 'spacegrotesk', weight: 500, tracking: 2, leading: 1.15, align: 'center', outline: 0, outlineColor: '#10171a', radius: 0, ...overrides };
}
export function defaultDesign(): SignDesign {
  return { schemaVersion: 2, name: 'Untitled sign', business: 'NAÏA', businessType: 'cafe', style: 'warm-modern', construction: 'channel', dimensions: { width: 3000, height: 850, depth: 80 }, unit: 'mm', objects: [newObject('panel',{ name:'Fascia',x:0,y:0,width:3000,height:850,depth:5,color:'#152a2a',material:'aluminiumComposite',locked:true,radius:16 }),newObject('text',{ name:'Main lettering',text:'NAÏA',x:350,y:180,width:2300,height:350,fontId:'syne',weight:600,color:'#f1dfbf',material:'aluminium',depth:55 }),newObject('text',{name:'Descriptor',text:'CAFÉ · ATELIER',x:750,y:605,width:1500,height:85,fontId:'spacegrotesk',weight:400,tracking:8,depth:8})], lighting: {type:'halo',color:'#ffe2b3',brightness:1.2}, mounting: {type:'standoffs',clearance:40,projection:0,points:4,exploded:false},placement:[{x:23,y:16},{x:80,y:16},{x:80,y:31},{x:23,y:31}],brandColors:['#152a2a','#f1dfbf'], notes:'' };
}
export function newProject(design = defaultDesign()): StudioProject {
  const now=new Date().toISOString(); return {schemaVersion:2,id:id(),name:design.name,createdAt:now,updatedAt:now,revision:0,design,versions:[],concepts:[],assets:[]};
}
export function validateProject(value: unknown): value is StudioProject {
  if (!value || typeof value !== 'object') return false;
  const p=value as StudioProject;
  if (p.schemaVersion!==2 || !identifier(p.id) || !string(p.name,120) || !finite(p.revision,0,1e9) || !validateDesign(p.design) || !Number.isFinite(Date.parse(p.createdAt)) || !Number.isFinite(Date.parse(p.updatedAt))) return false;
  if (!Array.isArray(p.versions) || p.versions.length>150 || p.versions.some((v)=>!v || !identifier(v.id) || !string(v.name,100) || !validateDesign(v.design) || v.fingerprint!==designFingerprint(v.design))) return false;
  if (!Array.isArray(p.concepts) || p.concepts.length>100 || p.concepts.some((c)=>!c || !identifier(c.id) || !identifier(c.imageAssetId) || !string(c.provider,80) || !string(c.promptVersion,100) || !validateDesign(c.snapshot) || c.fingerprint!==designFingerprint(c.snapshot) || !string(c.sourceDigest,100))) return false;
  if (!Array.isArray(p.assets) || p.assets.length>150 || p.assets.some((a)=>!a || !identifier(a.id) || !['storefront','logo','concept'].includes(a.kind) || !['image/jpeg','image/png','image/webp'].includes(a.mime) || !/^[a-f0-9]{64}$/.test(a.digest) || !string(a.name,240) || !finite(a.size,1,12*1024*1024) || !finite(a.width,1,30000) || !finite(a.height,1,30000) || !string(a.preview,400000) || !/^data:image\/(jpeg|png|webp);base64,/.test(a.preview))) return false;
  return true;
}
export function resizeDesign(design: SignDesign, width: number, height: number): SignDesign {
  const x=width/design.dimensions.width,y=height/design.dimensions.height;
  return {...design,dimensions:{...design.dimensions,width,height},objects:design.objects.map((o)=>({...o,x:o.x*x,y:o.y*y,width:o.width*x,height:o.height*y,radius:o.radius*Math.min(x,y)}))};
}
export interface DesignWarning { code: string; objectId?: string; message: string }
export function designWarnings(d: SignDesign, distance=10): DesignWarning[] {
  const warnings: DesignWarning[]=[];
  for (const o of d.objects.filter((o)=>o.visible)) {
    if (o.x<0 || o.y<0 || o.x+o.width>d.dimensions.width+1 || o.y+o.height>d.dimensions.height+1) warnings.push({code:'outside',objectId:o.id,message:`${o.name}: extends outside the sign boundary.`});
    if (o.kind==='text' && o.height < distance*8) warnings.push({code:'readability',objectId:o.id,message:`${o.name}: may be difficult to read from approximately ${distance} m.`});
    if (d.lighting.type==='internal' && o.kind==='text' && o.depth<30) warnings.push({code:'led-space',objectId:o.id,message:`${o.name}: allow enough depth for LED modules and diffusion; verify with the fabricator.`});
  }
  if (d.lighting.type==='halo' && d.mounting.clearance<20) warnings.push({code:'halo-clearance',message:'Halo lighting needs wall clearance; this design specifies less than 20 mm.'});
  if (d.construction==='projecting' && d.mounting.type!=='bracket') warnings.push({code:'bracket',message:'A projecting sign requires a reviewed support/bracket design.'});
  return warnings;
}
export function toLegacyConfiguration(d: SignDesign): SignConfiguration {
  const text=d.objects.filter((o)=>o.kind==='text' && o.visible).map((o)=>o.text).join('\n');
  const signType: SignConfiguration['signType']=d.construction==='panel'?'alucobond':d.construction==='channel'?'channelLetters':d.construction==='lightbox'?'lightbox':d.construction==='neon'?'neonStyle':d.construction==='acrylic'?'acrylic':d.construction==='window'||d.construction==='vehicle'?'vinyl':'custom';
  const materials=[...new Set(d.objects.filter((o)=>o.visible).map((o)=>o.material))].slice(0,6);
  return {businessName:d.business || d.name,category:d.businessType==='cafe'?'cafe':d.businessType==='restaurant'?'restaurant':d.businessType==='hotel'?'hotel':d.businessType==='pharmacy'||d.businessType==='medical'?'health':d.businessType==='barber'||d.businessType==='salon'?'beauty':'retail',signType,style:d.style.includes('luxury')?'luxury':d.style.includes('minimal')?'minimal':d.style.includes('industrial')?'industrial':'modern',materials,color:d.objects.find((o)=>o.kind==='text')?.color ?? '#ffffff',lighting:d.lighting.type==='halo'?'halo':d.lighting.type==='none'?'none':d.lighting.type==='neon'?'neon':'frontLit',exactText:text.slice(0,180),widthCm:String(d.dimensions.width/10),heightCm:String(d.dimensions.height/10),notes:(`Construction ${d.construction}; ${d.objects.filter((o)=>o.kind==='text').map((o)=>`${o.name}: font ${o.fontId}, ${o.depth} mm depth`).join('; ')}. Preserve the supplied business identity and logo. ${d.notes}`).slice(0,2000),signArea:{strokes:[{points:d.placement.map((p)=>({xPercent:p.x,yPercent:p.y}))}]},replaceExistingSurface:true};
}
