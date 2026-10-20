import 'fake-indexeddb/auto';
import {beforeAll,beforeEach,expect,it} from 'vitest';
import {db,setMeta,getMeta} from '../../src/storage/db';
import {connections,saveConnection,forgetConnection,localServerOrigin} from '../../src/storage/connections';
beforeAll(async()=>{Object.defineProperty(globalThis,'location',{configurable:true,value:{origin:'https://192.168.1.5:8443'}});await db.open();});
beforeEach(()=>db.meta.clear());
it('preserves a legacy pairing and independent acknowledgements when adding and forgetting a laptop',async()=>{
 const old={token:'old',serverId:'home',role:'phone' as const,at:1,ack:{a:4},lastSync:123};await setMeta('connection',old);
 const laptop={token:'laptop',serverId:'laptop',role:'phone' as const,at:2,origin:'https://recall-0123456789ab.local:8443',ack:{a:2}};
 await saveConnection(laptop);expect(await getMeta('connection')).toEqual(old);expect(await connections()).toHaveLength(2);
 await saveConnection({...laptop,ack:{a:7}});expect((await connections()).find(c=>c.serverId==='home')?.ack).toEqual({a:4});
 await forgetConnection('https://192.168.1.5:8443');expect((await getMeta<any>('connection')).token).toBe('laptop');expect(await connections()).toHaveLength(1);
});
it('accepts only local HTTPS addresses and loopback HTTP, without paths or embedded secrets',()=>{
 for(const origin of ['https://192.168.1.5:8443','https://10.0.1.2:8443','https://172.16.1.4:8443','https://recall-0123456789ab.local:8443','http://localhost:8787'])expect(localServerOrigin(origin)).toBe(origin);
 for(const origin of ['https://github.com','https://8.8.8.8','http://192.168.1.5','https://user:secret@192.168.1.5','https://192.168.1.5/api/','https://192.168.1.5?token=abc','https://172.32.1.1'])expect(()=>localServerOrigin(origin)).toThrow();
});
