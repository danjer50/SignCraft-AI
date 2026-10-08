// @vitest-environment node
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { closeProjectDatabase, readActiveDeviceProject, saveDeviceProject } from './projectDatabase';
import { newProject } from '../design/model';

afterEach(closeProjectDatabase);
describe('real IndexedDB recovery',()=>{
 it('waits for transaction commit and restores original binary assets after reconnect',async()=>{const p=newProject();const bytes=new Uint8Array([1,2,3]);p.assets.push({id:'binary-fixture',kind:'storefront',name:'fixture.png',mime:'image/png',digest:'a'.repeat(64),width:1,height:1,size:3,preview:'data:image/png;base64,AQID',blob:new Blob([bytes])});await saveDeviceProject('fixture-owner',p);await closeProjectDatabase();const restored=await readActiveDeviceProject('fixture-owner');expect(restored?.assets[0].blob).toBeDefined();expect(restored?.assets[0].blob?.size).toBe(3);expect(restored?.id).toBe(p.id);});
 it('does not overwrite another tab or expose another owner through the active-project lookup',async()=>{const p=newProject();await saveDeviceProject('conflict-owner',p);await saveDeviceProject('conflict-owner',{...p,revision:1,name:'newer'},0);await expect(saveDeviceProject('conflict-owner',{...p,name:'older'},0)).rejects.toMatchObject({code:'conflict'});expect((await readActiveDeviceProject('conflict-owner'))?.name).toBe('newer');expect(await readActiveDeviceProject('other-owner')).toBeNull();});
});
