import {describe,it,expect} from 'vitest';
import {connectionFile,readConnectionFile} from '../../src/storage/peer-file';
describe('connection files',()=>{
 const code='recall-peer:1:Example_code-123';
 it('round-trips an invitation and answer as small JSON files containing only pairing metadata',async()=>{
  for(const answer of [false,true]){
   const file=connectionFile(code,answer);expect(file.type).toBe('application/json');expect(file.name).toMatch(/\.recall-link\.json$/);
   expect(JSON.parse(await file.text())).toEqual({format:'recall-connection',version:1,code});expect(await readConnectionFile(file)).toBe(code);
  }
 });
 it('rejects study archives, corrupt or unsupported JSON, oversized files and arbitrary content',async()=>{
  for(const text of ['not JSON','null','{"format":"recall-archive","version":1}','{"format":"recall-connection","version":2,"code":"'+code+'"}','{"format":"recall-connection","version":1,"code":"javascript:alert(1)"}'])await expect(readConnectionFile(new File([text],'file.json'))).rejects.toThrow('не файл подключения');
  await expect(readConnectionFile(new File(['x'.repeat(20001)],'file.json'))).rejects.toThrow('слишком большой');
  expect(()=>connectionFile('arbitrary text',true)).toThrow('Некорректный');
 });
});
