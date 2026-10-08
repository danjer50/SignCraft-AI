// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { openSqlite } from './database.js';
import { readProject, reserveCounter, saveProject } from './repository.js';
import { newProject } from '../../src/design/model.js';

describe('real SQL project integrity',()=>{
 it('commits projects, enforces ownership and prevents lost updates',async()=>{const db=await openSqlite(':memory:');const p=newProject();const first=await saveProject(db,'customer-A',p,0);expect(first.cloudRevision).toBe(1);expect((await readProject(db,'customer-A',p.id)).id).toBe(p.id);await expect(readProject(db,'customer-B',p.id)).rejects.toMatchObject({code:'NOT_FOUND'});const updated=await saveProject(db,'customer-A',{...p,name:'Updated'},1);expect(updated.cloudRevision).toBe(2);await expect(saveProject(db,'customer-A',{...p,name:'Stale overwrite'},1)).rejects.toMatchObject({code:'CONFLICT'});expect((await readProject(db,'customer-A',p.id)).name).toBe('Updated');});
 it('reserves shared quotas atomically under concurrent calls and resets only after the window',async()=>{const db=await openSqlite(':memory:');const results=await Promise.all(Array.from({length:20},()=>reserveCounter(db,'fixture-budget',3,1000,10000)));expect(results.filter(Boolean)).toHaveLength(3);expect(await reserveCounter(db,'fixture-budget',3,1000,10999)).toBe(false);expect(await reserveCounter(db,'fixture-budget',3,1000,11000)).toBe(true);});
 it('rolls back failed transactions rather than leaving half-written state',async()=>{const db=await openSqlite(':memory:');await expect(db.transaction(async(tx)=>{await tx.query('INSERT INTO counters(key,count,reset_at) VALUES(?,?,?)',['rollback',1,1000]);throw new Error('fixture failure');})).rejects.toThrow('fixture failure');expect((await db.query('SELECT * FROM counters WHERE key = ?',['rollback'])).rows).toHaveLength(0);});
});
