import { validateProject, type StudioProject } from '../design/model';

const NAME='signcraft-projects-v2';
let openPromise:Promise<IDBDatabase>|undefined;
function database():Promise<IDBDatabase>{
 if(openPromise)return openPromise;
 openPromise=new Promise((resolve,reject)=>{
  if(typeof indexedDB==='undefined'){reject(new Error('Device project storage is unavailable.'));return;}
  const request=indexedDB.open(NAME,1);
  request.onupgradeneeded=()=>{const db=request.result;db.createObjectStore('projects',{keyPath:'key'});db.createObjectStore('meta');};
  request.onerror=()=>reject(request.error??new Error('Project storage could not be opened.'));
  request.onblocked=()=>reject(new Error('Close other SignCraft tabs before updating storage.'));
  request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();openPromise=undefined;};resolve(db);};
 });openPromise.catch(()=>{openPromise=undefined;});return openPromise;
}
export class ProjectStorageError extends Error {constructor(readonly code:'unavailable'|'conflict'|'corrupt',message:string){super(message);}}
interface StoredRow {key:string;owner:string;project:StudioProject}
export async function saveDeviceProject(owner:string,project:StudioProject,expectedRevision?:number):Promise<void>{
 if(!validateProject(project))throw new ProjectStorageError('corrupt','Invalid project; the previous saved project was preserved.');
 const db=await database();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(['projects','meta'],'readwrite');const store=tx.objectStore('projects');
  let conflict=false;
  const key=`${owner}:${project.id}`;
  const request=store.get(key);
  request.onsuccess=()=>{
   const existing=request.result as StoredRow|undefined;
   if(expectedRevision!==undefined&&existing&&existing.project.revision!==expectedRevision){conflict=true;tx.abort();return;}
   store.put({key,owner,project});tx.objectStore('meta').put(project.id,`active:${owner}`);
  };
  tx.oncomplete=()=>resolve();
  tx.onabort=()=>reject(new ProjectStorageError(conflict?'conflict':'unavailable',conflict?'This project changed in another tab. Your unsaved edits are preserved; duplicate or reload before saving.':'Saving failed. Export a project backup before leaving this page.'));
  tx.onerror=()=>{ /* onabort reports the actual failed transaction, never request-level success */ };
 });
}
export async function listDeviceProjects(owner:string):Promise<StudioProject[]>{
 const db=await database();return new Promise((resolve,reject)=>{const request=db.transaction('projects').objectStore('projects').getAll();request.onerror=()=>reject(request.error);request.onsuccess=()=>{const rows=request.result as StoredRow[];const own=rows.filter((r)=>r.owner===owner);if(own.some((r)=>!validateProject(r.project))){reject(new ProjectStorageError('corrupt','A saved project is invalid. No existing data was overwritten.'));return;}resolve(own.map((r)=>r.project).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)));};});
}
export async function readActiveDeviceProject(owner:string):Promise<StudioProject|null>{
 const db=await database();return new Promise((resolve,reject)=>{
  const tx=db.transaction(['meta','projects']);const request=tx.objectStore('meta').get(`active:${owner}`);
  request.onerror=()=>reject(request.error);request.onsuccess=()=>{if(!request.result){resolve(null);return;}const project=tx.objectStore('projects').get(`${owner}:${request.result}`);project.onerror=()=>reject(project.error);project.onsuccess=()=>{const row=project.result as StoredRow|undefined;if(!row){resolve(null);return;}if(!validateProject(row.project)){reject(new ProjectStorageError('corrupt','The saved project is damaged. It was not replaced.'));return;}resolve(row.project);};};
 });
}
/** Test-only connection reset; data is not deleted. */
export async function closeProjectDatabase():Promise<void>{if(openPromise)(await openPromise).close();openPromise=undefined;}
