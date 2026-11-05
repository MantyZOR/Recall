import {expect,it} from 'vitest';
import {createHash} from 'node:crypto';
import {existsSync,mkdtempSync,mkdirSync,readFileSync,rmSync} from 'node:fs';
import path from 'node:path';
import {selectInstaller,verifyInstallerDownload} from '../../scripts/update.mjs';

it('downloads only the expected newer release executable and refuses corrupt bytes',async()=>{
 const file=Buffer.alloc(2048,45),digest=createHash('sha256').update(file).digest('hex');
 const release={tag_name:'v0.7.0',draft:false,prerelease:false,assets:[{name:'RecallSetup.exe',browser_download_url:'https://github.com/MantyZOR/Recall/releases/download/v0.7.0/RecallSetup.exe',digest:'sha256:'+digest,size:file.length}]};
 const target=selectInstaller(release,'0.6.0');expect(target?.version).toBe('0.7.0');
 expect(selectInstaller(release,'0.7.0')).toBeNull();
 expect(selectInstaller({...release,draft:true},'0.6.0')).toBeNull();
 expect(()=>selectInstaller({...release,assets:[{...release.assets[0],browser_download_url:'https://example.com/RecallSetup.exe'}]},'0.6.0')).toThrow();
 const parent=path.resolve('tmp');mkdirSync(parent,{recursive:true});const folder=mkdtempSync(path.join(parent,'installer-digest-')),destination=path.join(folder,'download.exe');
 try{
  await expect(verifyInstallerDownload(new Response(Buffer.alloc(file.length,99)),destination,target!)).rejects.toThrow(/Контрольная сумма/);
  expect(existsSync(destination)).toBe(false);
  await verifyInstallerDownload(new Response(file),destination,target!);
  expect(readFileSync(destination)).toEqual(file);
 }finally{if(folder.startsWith(parent+path.sep))rmSync(folder,{recursive:true});}
});
