import 'fake-indexeddb/auto';
import {beforeAll,beforeEach,describe,it,expect} from 'vitest';
import {db,setMeta,getMeta} from '../../src/storage/db';
import {makeInvitation,encodeInvitation,decodeInvitation,rememberPeer,peers,forgetPeer} from '../../src/storage/peer-identity';
import {QrCollector,qrParts} from '../../src/storage/peer-qr';

beforeAll(()=>db.open());
beforeEach(async()=>{await db.meta.clear();await setMeta('identity',{id:'sender',name:'Телефон'});});
const session='aa111111-1111-4111-8111-111111111111',sdp='v=0\r\na=fingerprint:sha-256 '+Array(32).fill('AA').join(':')+'\r\n';
async function invitation(){return makeInvitation('offer',session,Date.now()+600000,sdp);}
describe('signed invitations and remembered device identity',()=>{
 it('accepts a genuine invitation only on another profile and rejects changed SDP, expiry and signatures',async()=>{
  const value=await invitation(),code=encodeInvitation(value);
  await expect(decodeInvitation(code)).rejects.toThrow('этого же');
  await setMeta('identity',{id:'receiver',name:'Ноутбук'});
  expect((await decodeInvitation(code)).name).toBe('Телефон');
  await expect(decodeInvitation(encodeInvitation({...value,sdp:sdp+'tampered'}))).rejects.toThrow('Подпись');
  await expect(decodeInvitation(code,Date.now()+700000)).rejects.toThrow('устарел');
  await expect(decodeInvitation(encodeInvitation({...value,signature:'A'.repeat(86)}))).rejects.toThrow('Подпись');
 });
 it('pins a device key, keeps last successful exchange across renames and permits explicit forgetting',async()=>{
  const original=await invitation();await setMeta('identity',{id:'receiver',name:'Ноутбук'});
  await rememberPeer(original,123456);expect((await peers())[0].lastSync).toBe(123456);
  await rememberPeer({...original,name:'Переименованный телефон'});expect((await peers())[0].lastSync).toBe(123456);
  await db.meta.delete('peerSigningKey');await setMeta('identity',{id:'sender',name:'Подмена'});
  const replacement=await invitation();await setMeta('identity',{id:'receiver',name:'Ноутбук'});
  await expect(decodeInvitation(encodeInvitation(replacement))).rejects.toThrow('Ключ знакомого');
  await expect(rememberPeer(replacement)).rejects.toThrow('Ключ устройства');
  await forgetPeer('sender');expect(await peers()).toEqual([]);
  expect(await getMeta('peerSigningKey')).toBeDefined();
 });
 it('assembles animated QR parts out of order, tolerates repeats, and rejects mixed or damaged payloads',()=>{
  const code='recall-peer:1:'+'a'.repeat(5300),parts=qrParts(code),reader=new QrCollector();
  expect(parts).toHaveLength(18);expect(reader.read(parts[4])).toMatchObject({received:1,total:18});expect(reader.read(parts[4]).received).toBe(1);
  for(const part of [...parts].reverse().slice(0,-1))reader.read(part);
  expect(reader.read(parts[0]).code).toBe(code);
  expect(new QrCollector().read('recall-peer:1:abc').code).toBe('recall-peer:1:abc');
  expect(()=>reader.read('unrelated')).toThrow('не QR');
  const damaged=new QrCollector();for(const part of parts.slice(0,-1))damaged.read(part);
  expect(()=>damaged.read(parts.at(-1)!.slice(0,-1)+'b')).toThrow('ошибкой');
 });
});
