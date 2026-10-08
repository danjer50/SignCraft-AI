import type { Pool, PoolClient } from 'pg';

export interface StorageEnvironment { DATABASE_URL?: string; SIGNCRAFT_DB_FILE?: string; DATABASE_SSL?: string; STORE?: SqlDatabase }
export type SqlValue = string | number | null;
export interface SqlResult { rows: Record<string, unknown>[]; changes: number }
export interface SqlDatabase {
  readonly kind: 'sqlite' | 'postgres';
  query(sql: string, parameters?: SqlValue[]): Promise<SqlResult>;
  transaction<T>(work: (database: SqlDatabase) => Promise<T>): Promise<T>;
}
const schema = [
 'CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, name TEXT NOT NULL, revision INTEGER NOT NULL, document TEXT NOT NULL, updated_at TEXT NOT NULL)',
 'CREATE INDEX IF NOT EXISTS projects_owner ON projects(owner_id)',
 'CREATE TABLE IF NOT EXISTS project_versions (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, owner_id TEXT NOT NULL, fingerprint TEXT NOT NULL, document TEXT NOT NULL, created_at TEXT NOT NULL)',
 'CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, mime TEXT NOT NULL, digest TEXT NOT NULL, size INTEGER NOT NULL, data_base64 TEXT NOT NULL)',
 'CREATE TABLE IF NOT EXISTS upload_chunks (upload_id TEXT NOT NULL, owner_id TEXT NOT NULL, project_id TEXT NOT NULL, part INTEGER NOT NULL, data_base64 TEXT NOT NULL, expires_at BIGINT NOT NULL, PRIMARY KEY(upload_id,part))',
 'CREATE TABLE IF NOT EXISTS quotes (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, project_id TEXT, status TEXT NOT NULL, document TEXT NOT NULL, created_at TEXT NOT NULL)',
 'CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, account_version TEXT NOT NULL, expires_at BIGINT NOT NULL, revoked INTEGER NOT NULL DEFAULT 0)',
 'CREATE TABLE IF NOT EXISTS counters (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at BIGINT NOT NULL)',
 'CREATE TABLE IF NOT EXISTS generation_jobs (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, fingerprint TEXT NOT NULL, state TEXT NOT NULL, document TEXT, expires_at BIGINT NOT NULL)',
 'CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, email TEXT NOT NULL UNIQUE, role TEXT NOT NULL, status TEXT NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL)',
];
export async function initializeDatabase(database: SqlDatabase): Promise<void> { for (const sql of schema) await database.query(sql); }

/** Real SQLite for local development/test persistence. Never used as Vercel ephemeral storage. */
export async function openSqlite(filename: string): Promise<SqlDatabase> {
  const { DatabaseSync }=await import('node:sqlite');
  if (filename!==':memory:') { const {mkdir}=await import('node:fs/promises');const {dirname}=await import('node:path');await mkdir(dirname(filename),{recursive:true}); }
  const native=new DatabaseSync(filename);
  native.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  if (filename!==':memory:') native.exec('PRAGMA journal_mode=WAL;');
  // Serialize full transactions, not just individual SQL calls, on a shared local connection.
  let queue:Promise<unknown>=Promise.resolve();
  const unlocked:SqlDatabase={kind:'sqlite',async query(sql,parameters=[]) {
    const statement=native.prepare(sql);
    if (/^\s*(SELECT|WITH|PRAGMA)/i.test(sql) || /\bRETURNING\b/i.test(sql)) {const rows=statement.all(...parameters) as Record<string,unknown>[];return {rows,changes:rows.length};}
    const result=statement.run(...parameters);return {rows:[],changes:Number(result.changes)};
  },async transaction(work) { native.exec('BEGIN IMMEDIATE');try {const result=await work(unlocked);native.exec('COMMIT');return result;}catch(error){native.exec('ROLLBACK');throw error;} }};
  const db:SqlDatabase={kind:'sqlite',query(sql,parameters){const pending=queue.then(()=>unlocked.query(sql,parameters));queue=pending.catch(()=>{});return pending;},transaction(work){const pending=queue.then(()=>unlocked.transaction(work));queue=pending.catch(()=>{});return pending;}};
  await initializeDatabase(db);return db;
}
function pgSql(sql:string):string {let index=0;return sql.replace(/\?/g,()=>`$${++index}`);}
function pgConnection(connection:Pool|PoolClient,pooled=true):SqlDatabase {return {kind:'postgres',async query(sql,parameters=[]) {const result=await connection.query(pgSql(sql),parameters);return {rows:result.rows as Record<string,unknown>[],changes:result.rowCount ?? 0};},async transaction(work) {
  if (!pooled) {await connection.query('SAVEPOINT nested');try{const result=await work(pgConnection(connection,false));await connection.query('RELEASE SAVEPOINT nested');return result;}catch(error){await connection.query('ROLLBACK TO SAVEPOINT nested');throw error;}}
  const client=await (connection as Pool).connect();try{await client.query('BEGIN');const result=await work(pgConnection(client,false));await client.query('COMMIT');return result;}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}};}
const instances=new Map<string,Promise<SqlDatabase>>();
export async function getDatabase(environment:StorageEnvironment):Promise<SqlDatabase|null> {
  if(environment.STORE) return environment.STORE;
  if(environment.DATABASE_URL) {
    const url=new URL(environment.DATABASE_URL);
    if(!['postgres:','postgresql:'].includes(url.protocol)) throw new Error('Invalid database protocol.');
    const key=environment.DATABASE_URL;
    let pending=instances.get(key);
    if(!pending){pending=(async()=>{const {Pool}=await import('pg');const pool=new Pool({connectionString:key,max:3,connectionTimeoutMillis:5000,idleTimeoutMillis:10000,statement_timeout:8000,...(environment.DATABASE_SSL==='require'?{ssl:{rejectUnauthorized:true}}:{})});const db=pgConnection(pool);await initializeDatabase(db);return db;})();instances.set(key,pending);pending.catch(()=>instances.delete(key));}
    return pending;
  }
  // Explicit opt-in file path only; no claim that a serverless /tmp file is durable.
  if(environment.SIGNCRAFT_DB_FILE && typeof process!=='undefined' && !process.env.VERCEL && process.env.NODE_ENV!=='production') {
    const key=`sqlite:${environment.SIGNCRAFT_DB_FILE}`;
    let pending=instances.get(key);if(!pending){pending=openSqlite(environment.SIGNCRAFT_DB_FILE);instances.set(key,pending);pending.catch(()=>instances.delete(key));}return pending;
  }
  return null;
}
