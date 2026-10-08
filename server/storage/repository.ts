import { validateProject, type StudioProject } from '../../src/design/model.js';
import type { SqlDatabase, SqlValue } from './database.js';

export class StoreError extends Error {constructor(readonly code:'NOT_FOUND'|'CONFLICT'|'FORBIDDEN'|'INVALID'|'LIMIT',message=code){super(message);}}
export function publicProject(project:StudioProject):StudioProject {
  return {...project,assets:project.assets.map(({blob:_blob,...asset})=>asset)};
}
export async function listProjects(db:SqlDatabase,owner:string):Promise<StudioProject[]> {
  const result=await db.query('SELECT document FROM projects WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 100',[owner]);
  return result.rows.map((r)=>JSON.parse(String(r.document)) as StudioProject).filter(validateProject);
}
export async function readProject(db:SqlDatabase,owner:string,id:string):Promise<StudioProject> {
  const result=await db.query('SELECT document FROM projects WHERE id = ? AND owner_id = ?',[id,owner]);
  if(!result.rows.length)throw new StoreError('NOT_FOUND');
  const value:unknown=JSON.parse(String(result.rows[0].document));if(!validateProject(value))throw new StoreError('INVALID');return value;
}
export async function saveProject(db:SqlDatabase,owner:string,project:StudioProject,expectedRevision:number):Promise<StudioProject> {
  if(!validateProject(project))throw new StoreError('INVALID');
  if(JSON.stringify(project).length>300_000)throw new StoreError('LIMIT');
  return db.transaction(async(tx)=>{
    const existing=await tx.query('SELECT owner_id,revision FROM projects WHERE id = ?',[project.id]);
    if(existing.rows.length && existing.rows[0].owner_id!==owner)throw new StoreError('NOT_FOUND');
    const current=existing.rows.length?Number(existing.rows[0].revision):0;
    if(current!==expectedRevision)throw new StoreError('CONFLICT');
    if(!existing.rows.length){const count=await tx.query('SELECT COUNT(*) AS count FROM projects WHERE owner_id = ?',[owner]);if(Number(count.rows[0].count)>=100)throw new StoreError('LIMIT');}
    const next=publicProject({...project,ownerId:owner,cloudRevision:current+1,updatedAt:new Date().toISOString()});
    const args:SqlValue[]=[next.name,current+1,JSON.stringify(next),next.updatedAt,next.id,owner,current];
    if(existing.rows.length){const updated=await tx.query('UPDATE projects SET name = ?,revision = ?,document = ?,updated_at = ? WHERE id = ? AND owner_id = ? AND revision = ? RETURNING id',args);if(!updated.rows.length)throw new StoreError('CONFLICT');}
    else await tx.query('INSERT INTO projects(id,owner_id,name,revision,document,updated_at) VALUES(?,?,?,?,?,?)',[next.id,owner,next.name,current+1,JSON.stringify(next),next.updatedAt]);
    for(const version of next.versions)await tx.query('INSERT INTO project_versions(id,project_id,owner_id,fingerprint,document,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING',[version.id,next.id,owner,version.fingerprint,JSON.stringify(version),version.createdAt]);
    return next;
  });
}
/** Shared atomic quota counter. Conditional UPDATE protects across processes/instances. */
export async function reserveCounter(db:SqlDatabase,key:string,limit:number,windowMs:number,now=Date.now()):Promise<boolean> {
  const result=await db.query('INSERT INTO counters(key,count,reset_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count = CASE WHEN counters.reset_at <= ? THEN 1 ELSE counters.count + 1 END, reset_at = CASE WHEN counters.reset_at <= ? THEN ? ELSE counters.reset_at END WHERE counters.reset_at <= ? OR counters.count < ? RETURNING count',[key,now+windowMs,now,now,now+windowMs,now,limit]);
  return result.rows.length===1;
}
export async function storeAsset(db:SqlDatabase,owner:string,projectId:string,asset:{id:string;mime:string;digest:string;size:number;data:string}):Promise<void> {
  await readProject(db,owner,projectId);
  if(asset.size>12*1024*1024 || asset.data.length>17*1024*1024)throw new StoreError('LIMIT');
  const old=await db.query('SELECT owner_id,digest FROM assets WHERE id = ?',[asset.id]);
  if(old.rows.length){if(old.rows[0].owner_id!==owner || old.rows[0].digest!==asset.digest)throw new StoreError('CONFLICT');return;}
  const usage=await db.query('SELECT COALESCE(SUM(size),0) AS size FROM assets WHERE owner_id = ?',[owner]);
  if(Number(usage.rows[0].size)+asset.size>250*1024*1024)throw new StoreError('LIMIT');
  await db.query('INSERT INTO assets(id,owner_id,project_id,mime,digest,size,data_base64) VALUES(?,?,?,?,?,?,?)',[asset.id,owner,projectId,asset.mime,asset.digest,asset.size,asset.data]);
}
