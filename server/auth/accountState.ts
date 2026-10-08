import { createUserRepository } from './users.js';
import type { AuthEnvironment, StoredAccount } from './types.js';
import { getDatabase } from '../storage/database.js';
import { fingerprint } from '../../src/domain/provenance.js';
import { normalizeAuthAccount } from '../../src/domain/auth.js';

export function accountVersion(account:StoredAccount):string{return fingerprint({id:account.id,role:account.role,status:account.status,passwordHash:account.passwordHash,username:account.username,email:account.email});}
export async function findStoredAccount(environment:AuthEnvironment,value:string,byId=false):Promise<StoredAccount|null>{
 const repo=createUserRepository(environment);
 const account=byId?repo.listAccounts().find((a)=>a.id===value):repo.findAccount(value);
 if(account){const stored=repo.findAccount(account.username)||repo.findAccount(account.email);if(stored)return stored;}
 const db=await getDatabase(environment);if(!db)return null;
 const result=byId?await db.query('SELECT * FROM accounts WHERE id = ?',[value]):await db.query('SELECT * FROM accounts WHERE LOWER(username) = ? OR LOWER(email) = ?',[value.toLowerCase(),value.toLowerCase()]);
 if(!result.rows.length)return null;const row=result.rows[0];const publicAccount=normalizeAuthAccount({id:row.id,username:row.username,email:row.email,role:row.role,status:row.status,createdAt:row.created_at});
 return publicAccount&&typeof row.password_hash==='string'?{...publicAccount,passwordHash:row.password_hash}:null;
}
export function durableSessionsRequired(environment:AuthEnvironment):boolean{return environment.REQUIRE_DURABLE_SESSIONS==='true'||typeof process!=='undefined'&&(process.env.NODE_ENV==='production'||!!process.env.VERCEL);}
