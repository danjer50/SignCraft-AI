import { defaultDesign, newObject, type Construction, type SignDesign, type MaterialId } from './model.js';
import type { FontId } from './fonts/catalogue.js';

export const BUSINESS_TYPES=['cafe','restaurant','bakery','barber','salon','clothing','electronics','phone-shop','pharmacy','hotel','office','real-estate','automotive','garage','gym','jewelry','furniture','supermarket','fast-food','medical','services','florist','bookshop','gallery','beauty','optician','dentist','boutique','patisserie','architecture','fitness','market'] as const;
interface Direction { id:string;name:string;background:string;foreground:string;accent:string;font:FontId;construction:Construction;material:MaterialId;lighting:SignDesign['lighting']['type'];tags:string[] }
const directions:Direction[]=[
 {id:'atelier',name:'Atelier',background:'#152c2c',foreground:'#eee0c5',accent:'#c49761',font:'syne',construction:'channel',material:'aluminium',lighting:'halo',tags:['modern','warm','elegant','bronze','led']},
 {id:'noir',name:'Maison Noir',background:'#101114',foreground:'#d1ac69',accent:'#8f7342',font:'cinzel',construction:'channel',material:'stainlessSteel',lighting:'halo',tags:['luxury','premium','black','gold','brass']},
 {id:'blade',name:'Sunline',background:'#b65c42',foreground:'#fff1d0',accent:'#432c24',font:'marcellus',construction:'projecting',material:'aluminium',lighting:'edge',tags:['creative','warm','projecting','enamel','led','cafe']},
 {id:'mono',name:'Monoline',background:'#e9e6de',foreground:'#1c2428',accent:'#667e87',font:'spacegrotesk',construction:'panel',material:'aluminiumComposite',lighting:'none',tags:['minimal','modern','clean','flat','alucobond']},
 {id:'signal',name:'Signal',background:'#f6ba35',foreground:'#151719',accent:'#ece7de',font:'anton',construction:'lightbox',material:'polycarbonate',lighting:'internal',tags:['bold','visible','lightbox','retail','led']},
 {id:'werk',name:'Werk',background:'#272e34',foreground:'#d5d7d5',accent:'#d78145',font:'barlowcondensed',construction:'channel',material:'galvanizedSteel',lighting:'front',tags:['industrial','metal','automotive','strong']},
 {id:'botanica',name:'Botanica',background:'#324c39',foreground:'#e5e6c8',accent:'#b7b77f',font:'cormorantgaramond',construction:'hanging',material:'wood',lighting:'front',tags:['organic','classic','wood','hanging','bakery']},
 {id:'electric',name:'Electric Script',background:'#172c35',foreground:'#b9e5d3',accent:'#d8b186',font:'caveat',construction:'neon',material:'neonFlex',lighting:'neon',tags:['creative','neon','handwritten','night']},
 {id:'editorial',name:'Editorial',background:'#e1d7c9',foreground:'#472c35',accent:'#bc835d',font:'bodonimoda',construction:'acrylic',material:'acrylic',lighting:'halo',tags:['elegant','fashion','premium','acrylic']},
 {id:'arabesque',name:'Dar',background:'#163e42',foreground:'#e4c99c',accent:'#b17951',font:'notonaskharabic',construction:'panel',material:'aluminiumComposite',lighting:'front',tags:['arabic','bilingual','traditional','elegant']},
 {id:'waymark',name:'Waymark',background:'#18394c',foreground:'#f1ede1',accent:'#91bdc5',font:'manrope',construction:'totem',material:'aluminiumComposite',lighting:'internal',tags:['corporate','totem','freestanding','office']},
 {id:'heritage',name:'Heritage',background:'#5c2635',foreground:'#edd9bb',accent:'#bd9a6d',font:'librebaskerville',construction:'monument',material:'wood',lighting:'front',tags:['classic','traditional','monument','hotel']},
 {id:'window',name:'Clear Identity',background:'#183641',foreground:'#f2ecd9',accent:'#c7b385',font:'outfit',construction:'window',material:'vinyl',lighting:'none',tags:['window','vinyl','minimal','graphics']},
 {id:'motion',name:'Motion',background:'#20292b',foreground:'#f0dbab',accent:'#cf693c',font:'unbounded',construction:'vehicle',material:'vinyl',lighting:'none',tags:['vehicle','modern','bold','graphics','automotive']},
];
export interface SignTemplate {id:string;name:string;business:string;construction:Construction;style:string;tags:string[];palette:string[];direction:string;proOnly:boolean;editable:true;recommendedWidth:number;recommendedHeight:number }
// Metadata-driven recipes, not one UI implementation per card. Every result builds actual objects.
export const TEMPLATE_LIBRARY:SignTemplate[]=BUSINESS_TYPES.flatMap((business,index)=>directions.filter((_,j)=>j<10 || index<12).map((direction,j)=>({id:`${business}-${direction.id}`,name:`${direction.name} / ${business.replaceAll('-',' ')}`,business,construction:direction.construction,style:direction.tags[0],tags:[business,...direction.tags,direction.construction,direction.material],palette:[direction.background,direction.foreground,direction.accent],direction:direction.id,proOnly:j>=4,editable:true as const,recommendedWidth:direction.construction==='projecting'||direction.construction==='hanging'?700:direction.construction==='totem'?800:3000,recommendedHeight:direction.construction==='projecting'?850:direction.construction==='hanging'?600:direction.construction==='totem'?2400:850})));
const synonyms:Record<string,string>={luxe:'luxury',luxueux:'luxury',haut:'premium',noir:'black',doré:'gold',or:'gold',café:'cafe',enseigne:'sign',barbier:'barber',coiffeur:'barber',coiffure:'salon',chaud:'warm',lumineux:'led',épuré:'minimal',moderne:'modern',projettante:'projecting',drapeau:'projecting',حلاق:'barber',مقهى:'cafe',فاخر:'luxury',ذهبي:'gold',أسود:'black',مطعم:'restaurant',عصري:'modern'};
export function searchTemplates(query:string,pro=false):SignTemplate[]{
 const terms=query.toLocaleLowerCase().normalize('NFKC').split(/[^\p{L}\p{N}-]+/u).filter(Boolean).map((v)=>synonyms[v]??v);
 return TEMPLATE_LIBRARY.filter((t)=>pro||!t.proOnly).map((template)=>({template,score:terms.reduce((score,term)=>score+([...template.tags,template.name.toLowerCase()].some((tag)=>tag.includes(term))?(term===template.business?3:term===template.construction?3:1):0),0)})).filter((v)=>!terms.length||v.score>0).sort((a,b)=>b.score-a.score||a.template.id.localeCompare(b.template.id)).map((v)=>v.template);
}
export function applyTemplate(template:SignTemplate,businessName='NAÏA',existing?:SignDesign):SignDesign {
 const direction=directions.find((d)=>d.id===template.direction)!;
 const width=template.recommendedWidth,height=template.recommendedHeight;
 const product=defaultDesign();
 const vertical=direction.construction==='totem';
 const circular=direction.construction==='projecting';
 const panel=newObject(circular?'ellipse':'panel',{name:'Sign structure',x:0,y:0,width,height,depth:direction.construction==='lightbox'?100:12,material:direction.construction==='lightbox'?'polycarbonate':direction.construction==='hanging'?'wood':'aluminiumComposite',color:direction.background,locked:true,radius:direction.construction==='panel'?0:35});
 const main=newObject('text',{name:'Main identity',text:businessName,fontId:direction.font,x:width*.12,y:height*(vertical?.32:.27),width:width*.76,height:height*(vertical?.16:.36),color:direction.foreground,material:direction.material,depth:direction.construction==='window'||direction.construction==='vehicle'?.2:direction.construction==='neon'?15:45,tracking:direction.id==='noir'?6:2,weight:direction.id==='signal'?700:500});
 const descriptor=newObject('text',{name:'Descriptor',text:template.business.replaceAll('-',' ').toUpperCase(),fontId:direction.font==='notonaskharabic'?'notosansarabic':'spacegrotesk',x:width*.22,y:height*(vertical?.58:.76),width:width*.56,height:height*.09,color:direction.foreground,depth:3,tracking:6,weight:400});
 const ornament=newObject('line',{name:'Architectural detail',x:width*.34,y:height*.68,width:width*.32,height:Math.max(2,height*.004),depth:2,color:direction.accent,material:'aluminium'});
 const backgroundless=['window','vehicle'].includes(direction.construction);
 const objects=backgroundless?[main,descriptor]:[panel,main,descriptor,ornament];
 const mounting:SignDesign['mounting']={type:circular?'bracket':direction.construction==='hanging'?'suspended':vertical?'posts':direction.lighting==='halo'?'standoffs':'rail',clearance:direction.lighting==='halo'?40:15,projection:circular?width:0,points:4,exploded:false};
 const result:SignDesign={...product,name:businessName,business:businessName,businessType:template.business,construction:direction.construction,style:direction.tags[0],dimensions:{width,height,depth:direction.construction==='lightbox'?120:80},objects,lighting:{type:direction.lighting,color:'#ffe1b0',brightness:1.2},mounting,templateId:template.id,brandColors:[...template.palette]};
 if(existing){result.sourceAssetId=existing.sourceAssetId;result.logoAssetId=existing.logoAssetId;result.placement=existing.placement;result.notes=existing.notes;const logo=existing.objects.find((o)=>o.kind==='logo');if(logo)result.objects.push({...logo,x:width*.42,y:height*.05,width:width*.16,height:height*.16});}
 return result;
}
export function designVariations(design:SignDesign):SignDesign[]{
 return ['noir','mono','signal'].map((direction)=>applyTemplate(TEMPLATE_LIBRARY.find((t)=>t.business===design.businessType&&t.direction===direction)??TEMPLATE_LIBRARY.find((t)=>t.direction===direction)!,design.business,design));
}
