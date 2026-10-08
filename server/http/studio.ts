import { authenticate, isSameOriginRequest, jsonResponse, authFailure } from '../auth/guard.js';
import { getDatabase, type StorageEnvironment } from '../storage/database.js';
import { listProjects, readProject, saveProject, storeAsset, StoreError, reserveCounter } from '../storage/repository.js';
import { boundedJson, BodyError } from './body.js';
import { validateProject, designFingerprint, type StudioProject } from '../../src/design/model.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { decodeRaster } from '../ai/rasterDecode.js';
import { hasValidImageSignature } from './imageValidation.js';
import { describeAiProviders } from '../ai/router.js';
import type { AuthEnvironment } from '../auth/types.js';

export type StudioEnvironment=AuthEnvironment&StorageEnvironment;
const identifier=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v);
const toHex=(bytes:Uint8Array)=>Array.from(bytes,(b)=>b.toString(16).padStart(2,'0')).join('');
function failure(code:string,status:number,id:string){return jsonResponse(status,{status:'ERROR',code,diagnosticId:id,message:code==='CONFLICT'?'This project changed elsewhere. Your local work is preserved. Reload or duplicate before synchronizing.':code==='STORAGE_NOT_CONFIGURED'?'Cloud storage is not connected. Keep a device copy or export your project.':'The operation could not be confirmed. Your current work was not replaced.'});}
export async function handleRuntime(_request:Request,environment:StudioEnvironment):Promise<Response>{
 try{const db=await getDatabase(environment);if(db)await db.query('SELECT 1 AS healthy');const providers=describeAiProviders(environment);return jsonResponse(200,{status:'OK',storage:{configured:!!db,kind:db?.kind??null,mode:db?.kind==='sqlite'?'development':db?'server':'device-only'},ai:{providers:providers,protected:!!db&&!!(environment.AI_ABUSE_SECRET||environment.AUTH_SESSION_SECRET)},billing:{implemented:false},production:{engineeringCertification:false}});}catch{return jsonResponse(503,{status:'ERROR',code:'RUNTIME_UNAVAILABLE',storage:{configured:false},ai:{providers:[],protected:false}});}
}
export async function handleStudio(request:Request,environment:StudioEnvironment):Promise<Response>{
 const diagnosticId=globalThis.crypto.randomUUID();
 try {
  if(!['GET','POST','PUT'].includes(request.method))return failure('METHOD_NOT_ALLOWED',405,diagnosticId);
  if(request.method!=='GET'&&!isSameOriginRequest(request))return failure('FORBIDDEN',403,diagnosticId);
  const state=await authenticate(request,environment);if(state.status!=='AUTHENTICATED')return authFailure(401,'SESSION_REQUIRED','Sign in to use server project storage.');
  const db=await getDatabase(environment);if(!db)return failure('STORAGE_NOT_CONFIGURED',503,diagnosticId);
  const owner=state.account.id;const url=new URL(request.url);const action=url.searchParams.get('action')??'projects';
  if(request.method==='GET'){
   if(action==='projects')return jsonResponse(200,{status:'OK',projects:await listProjects(db,owner)});
   const projectId=url.searchParams.get('project');if(!identifier(projectId))return failure('INVALID',400,diagnosticId);
   const project=await readProject(db,owner,projectId);
   if(action==='project')return jsonResponse(200,{status:'OK',project});
   if(action==='asset'){
    const assetId=url.searchParams.get('asset');if(!identifier(assetId)||!project.assets.some((a)=>a.id===assetId))return failure('NOT_FOUND',404,diagnosticId);
    const result=await db.query('SELECT mime,data_base64 FROM assets WHERE id = ? AND owner_id = ?',[assetId,owner]);if(!result.rows.length)return failure('NOT_FOUND',404,diagnosticId);
    const binary=atob(String(result.rows[0].data_base64));const bytes=Uint8Array.from(binary,(char)=>char.charCodeAt(0));return new Response(bytes,{headers:{'content-type':String(result.rows[0].mime),'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
   }
   if(action==='quotes'){const rows=await db.query('SELECT document,status FROM quotes WHERE owner_id = ? ORDER BY created_at DESC LIMIT 100',[owner]);return jsonResponse(200,{status:'OK',quotes:rows.rows.map((r)=>({...JSON.parse(String(r.document)),status:r.status}))});}
   return failure('NOT_FOUND',404,diagnosticId);
  }
  const body=await boundedJson(request);
  if(action==='save'){
   if(!validateProject(body.project)||typeof body.expectedRevision!=='number'||!Number.isInteger(body.expectedRevision)||body.expectedRevision<0)return failure('INVALID',400,diagnosticId);
   const project=body.project;
   // A published cloud project may reference only fully committed assets belonging to its owner.
   for(const asset of project.assets){const stored=await db.query('SELECT digest FROM assets WHERE id = ? AND owner_id = ?',[asset.id,owner]);if(!stored.rows.length||stored.rows[0].digest!==asset.digest)return failure('ASSET_NOT_COMMITTED',409,diagnosticId);}
   const saved=await saveProject(db,owner,project,body.expectedRevision);return jsonResponse(200,{status:'SAVED',project:saved});
  }
  const projectId=body.projectId;if(!identifier(projectId))return failure('INVALID',400,diagnosticId);
  const project=await readProject(db,owner,projectId);
  if(action==='chunk'){
   const uploadId=body.uploadId,part=body.part,data=body.data;
   if(!identifier(uploadId)||typeof part!=='number'||!Number.isInteger(part)||part<0||part>=40||typeof data!=='string'||data.length>700000||!/^[A-Za-z0-9+/]+={0,2}$/.test(data))return failure('INVALID',400,diagnosticId);
   if(!await reserveCounter(db,`upload:${owner}`,400,3600000))return failure('RATE_LIMIT',429,diagnosticId);
   await db.query('DELETE FROM upload_chunks WHERE expires_at < ?',[Date.now()]);
   const result=await db.query('INSERT INTO upload_chunks(upload_id,owner_id,project_id,part,data_base64,expires_at) VALUES(?,?,?,?,?,?) ON CONFLICT(upload_id,part) DO UPDATE SET data_base64 = ?,expires_at = ? WHERE upload_chunks.owner_id = ? AND upload_chunks.project_id = ? RETURNING part',[uploadId,owner,projectId,part,data,Date.now()+3600000,data,Date.now()+3600000,owner,projectId]);
   if(!result.rows.length)return failure('NOT_FOUND',404,diagnosticId);return jsonResponse(200,{status:'STORED',part});
  }
  if(action==='commit-asset'){
   const asset=body.asset as StudioProject['assets'][number]|undefined,total=body.parts;
   if(!asset||!identifier(asset.id)||!['image/jpeg','image/png','image/webp'].includes(asset.mime)||typeof total!=='number'||!Number.isInteger(total)||total<1||total>40)return failure('INVALID',400,diagnosticId);
   const rows=await db.query('SELECT part,data_base64 FROM upload_chunks WHERE upload_id = ? AND owner_id = ? AND project_id = ? ORDER BY part',[asset.id,owner,projectId]);
   if(rows.rows.length!==total||rows.rows.some((r,i)=>Number(r.part)!==i))return failure('UPLOAD_INCOMPLETE',409,diagnosticId);
   const chunks=rows.rows.map((r)=>Uint8Array.from(atob(String(r.data_base64)),(char)=>char.charCodeAt(0)));const size=chunks.reduce((sum,c)=>sum+c.length,0);
   if(size>10*1024*1024||size!==asset.size)return failure('BODY_SIZE',413,diagnosticId);const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
   if(!hasValidImageSignature(asset.mime,bytes.subarray(0,12))||toHex(sha256(bytes))!==asset.digest)return failure('INVALID_IMAGE',415,diagnosticId);
   const raster=await decodeRaster(bytes,asset.mime,environment.IMAGE_DECODER_MODULES,24_000_000);if(!raster)return failure('INVALID_IMAGE',415,diagnosticId);
   let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
   await storeAsset(db,owner,projectId,{id:asset.id,mime:asset.mime,digest:asset.digest,size,data:btoa(binary)});
   await db.query('DELETE FROM upload_chunks WHERE upload_id = ? AND owner_id = ?',[asset.id,owner]);return jsonResponse(200,{status:'COMMITTED',id:asset.id});
  }
  if(action==='quote'){
   const customer=body.customer as {name?:unknown;email?:unknown;phone?:unknown}|undefined;
   if(!customer||typeof customer.name!=='string'||customer.name.trim().length<2||customer.name.length>120||typeof customer.email!=='string'||customer.email.length>254||!/^\S+@\S+\.\S+$/.test(customer.email)||typeof customer.phone!=='string'||customer.phone.length>80||body.consent!==true)return failure('INVALID_QUOTE',400,diagnosticId);
   if(typeof body.fingerprint!=='string'||body.fingerprint!==designFingerprint(project.design))return failure('CONFLICT',409,diagnosticId);
   if(!await reserveCounter(db,`quote:${owner}`,10,86400000))return failure('RATE_LIMIT',429,diagnosticId);
   const id=globalThis.crypto.randomUUID();const record={id,projectId,customer,design:project.design,concepts:project.concepts.filter((c)=>c.fingerprint===body.fingerprint),createdAt:new Date().toISOString(),status:'NEW'};
   await db.query('INSERT INTO quotes(id,owner_id,project_id,status,document,created_at) VALUES(?,?,?,?,?,?)',[id,owner,projectId,'NEW',JSON.stringify(record),record.createdAt]);return jsonResponse(201,{status:'CONFIRMED',id});
  }
  return failure('NOT_FOUND',404,diagnosticId);
 }catch(error){
  if(error instanceof StoreError)return failure(error.code,error.code==='CONFLICT'?409:error.code==='NOT_FOUND'?404:400,diagnosticId);
  if(error instanceof BodyError)return failure(error.code,error.code==='BODY_SIZE'?413:400,diagnosticId);
  return failure('SERVICE_UNAVAILABLE',503,diagnosticId);
 }
}
